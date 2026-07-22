/**
 * Testes do MemoryOrderStore — o contrato de store, verificável sem banco.
 * A implementação Postgres deve respeitar a MESMA semântica.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { type CanonicalOrder } from '../../core'
import { MemoryOrderStore } from '../../store/memoryStore'

function order(orderId: string, createdAt: string, over: Partial<CanonicalOrder> = {}): CanonicalOrder {
  return {
    orderId, createdAt, status: 'paid', rawStatus: 'invoiced',
    totalMinor: 10000, currency: 'BRL', ...over,
  }
}

const RANGE = { start: new Date('2026-01-01'), end: new Date('2026-01-31T23:59:59Z') }

describe('MemoryOrderStore', () => {
  test('upsert grava e getOrders devolve dentro da janela', async () => {
    const store = new MemoryOrderStore()
    await store.upsertOrders('loja', [order('o1', '2026-01-10T12:00:00Z')])
    const out = await store.getOrders({ storeAccount: 'loja', range: RANGE })
    assert.equal(out.length, 1)
    assert.equal(out[0].orderId, 'o1')
  })

  test('filtra por janela de data', async () => {
    const store = new MemoryOrderStore()
    await store.upsertOrders('loja', [
      order('dentro', '2026-01-10T12:00:00Z'),
      order('antes', '2025-12-31T12:00:00Z'),
      order('depois', '2026-02-01T12:00:00Z'),
    ])
    const out = await store.getOrders({ storeAccount: 'loja', range: RANGE })
    assert.deepEqual(out.map((o) => o.orderId), ['dentro'])
  })

  test('ISOLAMENTO: nunca devolve pedido de outra loja', async () => {
    const store = new MemoryOrderStore()
    await store.upsertOrders('loja-a', [order('a1', '2026-01-10T12:00:00Z')])
    await store.upsertOrders('loja-b', [order('b1', '2026-01-10T12:00:00Z')])
    const a = await store.getOrders({ storeAccount: 'loja-a', range: RANGE })
    assert.deepEqual(a.map((o) => o.orderId), ['a1'])
  })

  test('upsert é idempotente (não duplica) e atualiza o cabeçalho', async () => {
    const store = new MemoryOrderStore()
    await store.upsertOrders('loja', [order('o1', '2026-01-10T12:00:00Z', { totalMinor: 10000 })])
    await store.upsertOrders('loja', [order('o1', '2026-01-10T12:00:00Z', { totalMinor: 25000 })])
    const out = await store.getOrders({ storeAccount: 'loja', range: RANGE })
    assert.equal(out.length, 1)
    assert.equal(out[0].totalMinor, 25000)
  })

  test('itens só voltam com withItems', async () => {
    const store = new MemoryOrderStore()
    await store.upsertOrders('loja', [
      order('o1', '2026-01-10T12:00:00Z', {
        items: [{ skuId: 's', productId: 'p', name: 'X', quantity: 1, unitPaidMinor: 10000 }],
      }),
    ])
    const sem = await store.getOrders({ storeAccount: 'loja', range: RANGE })
    assert.equal(sem[0].items, undefined)
    const com = await store.getOrders({ storeAccount: 'loja', range: RANGE, withItems: true })
    assert.equal(com[0].items?.length, 1)
  })

  test('upsert sem itens PRESERVA o detalhe já sincronizado (não rebaixa)', async () => {
    const store = new MemoryOrderStore()
    // 1ª carga: com itens
    await store.upsertOrders('loja', [
      order('o1', '2026-01-10T12:00:00Z', {
        items: [{ skuId: 's', productId: 'p', name: 'X', quantity: 1, unitPaidMinor: 10000 }],
      }),
    ])
    // 2ª carga: só cabeçalho (ex.: re-sync sem --items)
    await store.upsertOrders('loja', [order('o1', '2026-01-10T12:00:00Z', { totalMinor: 30000 })])
    const com = await store.getOrders({ storeAccount: 'loja', range: RANGE, withItems: true })
    assert.equal(com[0].totalMinor, 30000) // cabeçalho atualizou
    assert.equal(com[0].items?.length, 1) // itens preservados
  })

  test('mutação externa não afeta o que está guardado (clones)', async () => {
    const store = new MemoryOrderStore()
    const o = order('o1', '2026-01-10T12:00:00Z')
    await store.upsertOrders('loja', [o])
    o.totalMinor = 999999 // mexe no objeto original depois de gravar
    const out = await store.getOrders({ storeAccount: 'loja', range: RANGE })
    assert.equal(out[0].totalMinor, 10000)
  })

  test('sync state: null antes, persiste depois', async () => {
    const store = new MemoryOrderStore()
    assert.equal(await store.getSyncState('loja'), null)
    const d = new Date('2026-01-20T00:00:00Z')
    await store.setSyncState('loja', d)
    const got = await store.getSyncState('loja')
    assert.equal(got?.getTime(), d.getTime())
  })
})
