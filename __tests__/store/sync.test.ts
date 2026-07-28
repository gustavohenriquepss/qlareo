/**
 * Testes do sync — adapter -> store. Adapter FALSO, store em memória.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { type CanonicalOrder, type PlatformAdapter } from '../../core'
import { MemoryOrderStore } from '../../store/memoryStore'
import { syncOrders } from '../../store/sync'

function order(orderId: string, createdAt: string): CanonicalOrder {
  return {
    orderId, createdAt, status: 'paid', rawStatus: 'invoiced',
    totalMinor: 10000, currency: 'BRL',
  }
}

const ITEMS = [{ skuId: 's', productId: 'p', name: 'X', quantity: 1, unitPaidMinor: 10000 }]

/** Adapter falso: registra chamadas e devolve pedidos canônicos fixos. */
function fakeAdapter(orders: CanonicalOrder[]) {
  const calls = { fetch: 0, enrich: 0 }
  const adapter: PlatformAdapter = {
    platform: 'fake',
    async fetchOrders() {
      calls.fetch++
      return orders.map((o) => ({ ...o }))
    },
    async enrichWithDetail(os) {
      calls.enrich++
      return os.map((o) => ({ ...o, items: ITEMS.map((i) => ({ ...i })) }))
    },
  }
  return { adapter, calls }
}

const RANGE = { start: new Date('2026-01-01'), end: new Date('2026-01-31T23:59:59Z') }

describe('syncOrders', () => {
  test('grava os pedidos do adapter no store', async () => {
    const { adapter } = fakeAdapter([order('o1', '2026-01-10T12:00:00Z'), order('o2', '2026-01-12T12:00:00Z')])
    const store = new MemoryOrderStore()

    const res = await syncOrders(adapter, store, 'loja', RANGE)

    assert.equal(res.pedidosSincronizados, 2)
    const stored = await store.getOrders({ storeAccount: 'loja', range: RANGE })
    assert.equal(stored.length, 2)
  })

  test('sem --items NÃO enriquece; com --items enriquece', async () => {
    const { adapter, calls } = fakeAdapter([order('o1', '2026-01-10T12:00:00Z')])
    const store = new MemoryOrderStore()

    await syncOrders(adapter, store, 'loja', RANGE)
    assert.equal(calls.enrich, 0)
    const sem = await store.getOrders({ storeAccount: 'loja', range: RANGE, withItems: true })
    assert.equal(sem[0].items?.length ?? 0, 0)

    await syncOrders(adapter, store, 'loja', RANGE, { enrichItems: true })
    assert.equal(calls.enrich, 1)
    const com = await store.getOrders({ storeAccount: 'loja', range: RANGE, withItems: true })
    assert.equal(com[0].items?.length, 1)
  })

  test('idempotente: rodar duas vezes não duplica', async () => {
    const { adapter } = fakeAdapter([order('o1', '2026-01-10T12:00:00Z')])
    const store = new MemoryOrderStore()
    await syncOrders(adapter, store, 'loja', RANGE)
    await syncOrders(adapter, store, 'loja', RANGE)
    const stored = await store.getOrders({ storeAccount: 'loja', range: RANGE })
    assert.equal(stored.length, 1)
  })

  test('avança a marca d\'água para o maior created_at visto', async () => {
    const { adapter } = fakeAdapter([
      order('o1', '2026-01-10T12:00:00Z'),
      order('o2', '2026-01-20T08:00:00Z'), // o mais recente
      order('o3', '2026-01-15T12:00:00Z'),
    ])
    const store = new MemoryOrderStore()
    await syncOrders(adapter, store, 'loja', RANGE)
    const wm = await store.getSyncState('loja')
    assert.equal(wm?.toISOString(), '2026-01-20T08:00:00.000Z')
  })

  test('intervalo sem pedidos usa o fim do range como marca d\'água', async () => {
    const { adapter } = fakeAdapter([])
    const store = new MemoryOrderStore()
    await syncOrders(adapter, store, 'loja', RANGE)
    const wm = await store.getSyncState('loja')
    assert.equal(wm?.getTime(), RANGE.end.getTime())
  })
})
