/**
 * Testes do mapper VTEX -> canônico. Funções puras, sem I/O.
 * Runner: nativo do Node (`node:test` + `node:assert/strict`).
 * Todos os dados são sintéticos (emails @example.com, ids fictícios).
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { mapVtexItem, mapVtexOrder, mapVtexStatus } from '../../../adapters/vtex/mapper'
import {
  type VtexOrderItem,
  type VtexOrderSummary,
} from '../../../adapters/vtex/raw-types'

function makeRawOrder(
  partial: Partial<VtexOrderSummary> & { orderId: string }
): VtexOrderSummary {
  return {
    creationDate: '2026-01-10T12:00:00.000Z',
    status: 'invoiced',
    value: 10000,
    ...partial,
  }
}

// ============================================================================
// mapVtexStatus — o coração da decisão de produto
// ============================================================================

describe('mapVtexStatus', () => {
  test("'canceled' -> 'canceled'", () => {
    assert.equal(mapVtexStatus('canceled'), 'canceled')
  })

  test("os três status de 'nunca pagou' -> 'pending'", () => {
    assert.equal(mapVtexStatus('window-to-change-payment'), 'pending')
    assert.equal(mapVtexStatus('payment-pending'), 'pending')
    assert.equal(mapVtexStatus('incomplete'), 'pending')
  })

  test("status padrão de venda ('invoiced', 'payment-approved', ...) -> 'paid'", () => {
    for (const s of [
      'invoiced',
      'payment-approved',
      'handling',
      'ready-for-handling',
      'waiting-for-sellers-confirmation',
      'invoice',
    ]) {
      assert.equal(mapVtexStatus(s), 'paid', `esperava paid para "${s}"`)
    }
  })

  test('STATUS CUSTOMIZADO DESCONHECIDO -> paid (filtro por EXCLUSÃO)', () => {
    // Regra travada: o workflow da loja pode inventar qualquer nome. Se o
    // desconhecido caísse fora, o faturamento encolheria em silêncio.
    assert.equal(mapVtexStatus('separacao-loja-3'), 'paid')
    assert.equal(mapVtexStatus('aguardando-conferencia'), 'paid')
    assert.equal(mapVtexStatus('custom-status-xyz'), 'paid')
    assert.equal(mapVtexStatus(''), 'paid')
  })

  test('o mapeamento é case-sensitive: só o nome exato da VTEX conta', () => {
    // 'Canceled' não é um status da VTEX; tratar como desconhecido é o
    // comportamento seguro (entra no relatório e fica auditável no rawStatus).
    assert.equal(mapVtexStatus('Canceled'), 'paid')
  })
})

// ============================================================================
// mapVtexOrder
// ============================================================================

describe('mapVtexOrder', () => {
  test('mapeia os campos base e fixa a moeda em BRL', () => {
    const out = mapVtexOrder(
      makeRawOrder({
        orderId: '1234567890-01',
        creationDate: '2026-01-15T23:30:00.000Z',
        status: 'invoiced',
        value: 14990,
        paymentNames: 'Visa',
        sellerNames: ['loja-principal'],
        clientEmail: 'cliente@example.com',
      })
    )

    assert.equal(out.orderId, '1234567890-01')
    assert.equal(out.createdAt, '2026-01-15T23:30:00.000Z')
    assert.equal(out.status, 'paid')
    assert.equal(out.currency, 'BRL')
    assert.equal(out.paymentMethod, 'Visa')
  })

  test('CENTAVOS são copiados sem reconversão: 14990 -> 14990 (bug nº 1 do domínio)', () => {
    const out = mapVtexOrder(makeRawOrder({ orderId: 'a', value: 14990 }))
    assert.equal(out.totalMinor, 14990)
    // e não 149.9 nem 1499000
    assert.notEqual(out.totalMinor, 149.9)
    assert.ok(Number.isInteger(out.totalMinor))
  })

  test('valores de borda em centavos: 0 e 1', () => {
    assert.equal(mapVtexOrder(makeRawOrder({ orderId: 'a', value: 0 })).totalMinor, 0)
    assert.equal(mapVtexOrder(makeRawOrder({ orderId: 'b', value: 1 })).totalMinor, 1)
  })

  test('rawStatus preserva o status original mesmo quando o canônico é paid', () => {
    const out = mapVtexOrder(makeRawOrder({ orderId: 'a', status: 'separacao-loja-3' }))
    assert.equal(out.status, 'paid')
    assert.equal(out.rawStatus, 'separacao-loja-3')
  })

  test('rawStatus preservado também para canceled e pending', () => {
    const c = mapVtexOrder(makeRawOrder({ orderId: 'a', status: 'canceled' }))
    assert.equal(c.status, 'canceled')
    assert.equal(c.rawStatus, 'canceled')

    const p = mapVtexOrder(makeRawOrder({ orderId: 'b', status: 'payment-pending' }))
    assert.equal(p.status, 'pending')
    assert.equal(p.rawStatus, 'payment-pending')
  })

  test('e-mail vindo de clientEmail', () => {
    const out = mapVtexOrder(
      makeRawOrder({ orderId: 'a', clientEmail: 'direto@example.com' })
    )
    assert.equal(out.customerEmail, 'direto@example.com')
  })

  test('e-mail vindo de clientProfileData.email quando clientEmail falta', () => {
    const out = mapVtexOrder(
      makeRawOrder({
        orderId: 'a',
        clientProfileData: { email: 'perfil@example.com' },
      })
    )
    assert.equal(out.customerEmail, 'perfil@example.com')
  })

  test('clientEmail tem precedência sobre clientProfileData.email', () => {
    const out = mapVtexOrder(
      makeRawOrder({
        orderId: 'a',
        clientEmail: 'direto@example.com',
        clientProfileData: { email: 'perfil@example.com' },
      })
    )
    assert.equal(out.customerEmail, 'direto@example.com')
  })

  test('sellerNames (array) -> sellerName: o primeiro seller', () => {
    const out = mapVtexOrder(
      makeRawOrder({ orderId: 'a', sellerNames: ['principal', 'parceiro-2'] })
    )
    assert.equal(out.sellerName, 'principal')
  })

  test('pedido sem seller e sem e-mail não quebra: campos ficam undefined', () => {
    const out = mapVtexOrder(makeRawOrder({ orderId: 'a' }))
    assert.equal(out.sellerName, undefined)
    assert.equal(out.customerEmail, undefined)
    assert.equal(out.paymentMethod, undefined)
    // o essencial continua lá
    assert.equal(out.orderId, 'a')
    assert.equal(out.totalMinor, 10000)
  })

  test('sellerNames vazio não vira sellerName', () => {
    const out = mapVtexOrder(makeRawOrder({ orderId: 'a', sellerNames: [] }))
    assert.equal(out.sellerName, undefined)
  })

  test('sem items no cru, o canônico não traz items (só o enriquecimento preenche)', () => {
    const out = mapVtexOrder(makeRawOrder({ orderId: 'a' }))
    assert.equal(out.items, undefined)
  })

  test('items presentes no cru são mapeados junto', () => {
    const out = mapVtexOrder(
      makeRawOrder({
        orderId: 'a',
        items: [
          { id: 'sku-1', productId: 'prod-1', name: 'Camiseta', quantity: 2, price: 4990 },
        ],
      })
    )
    assert.equal(out.items?.length, 1)
    assert.equal(out.items?.[0].skuId, 'sku-1')
    assert.equal(out.items?.[0].unitPaidMinor, 4990)
  })

  test('usa totalValue como fallback quando value não vem', () => {
    const raw = makeRawOrder({ orderId: 'a', totalValue: 25000 })
    delete (raw as Partial<VtexOrderSummary>).value
    assert.equal(mapVtexOrder(raw).totalMinor, 25000)
  })
})

// ============================================================================
// mapVtexItem
// ============================================================================

describe('mapVtexItem', () => {
  const raw: VtexOrderItem = {
    id: 'sku-42',
    productId: 'prod-7',
    name: 'Tênis Runner',
    quantity: 3,
    price: 19990,
    listPrice: 24990,
    sellingPrice: 19990,
  }

  test('id -> skuId e productId preservado (relatório de produto agrupa por productId)', () => {
    const out = mapVtexItem(raw)
    assert.equal(out.skuId, 'sku-42')
    assert.equal(out.productId, 'prod-7')
    assert.notEqual(out.skuId, out.productId)
  })

  test('nome e quantidade copiados', () => {
    const out = mapVtexItem(raw)
    assert.equal(out.name, 'Tênis Runner')
    assert.equal(out.quantity, 3)
  })

  test('price -> unitPaidMinor e listPrice -> unitListMinor, ambos em centavos intactos', () => {
    const out = mapVtexItem(raw)
    assert.equal(out.unitPaidMinor, 19990)
    assert.equal(out.unitListMinor, 24990)
  })

  test('item sem listPrice não traz unitListMinor (sem desconto a calcular)', () => {
    const out = mapVtexItem({
      id: 'sku-1',
      productId: 'prod-1',
      name: 'Meia',
      quantity: 1,
      price: 1990,
    })
    assert.equal(out.unitListMinor, undefined)
    assert.equal(out.unitPaidMinor, 1990)
  })
})
