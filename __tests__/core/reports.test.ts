/**
 * Testes dos 4 relatórios canônicos (core/reports.ts) — agregação pura, sem rede.
 * Runner: nativo do Node (`node:test` + `node:assert`), sem dependências.
 * Todos os dados são sintéticos (emails @example.com, ids fictícios).
 *
 * Porte da cobertura de `__tests__/reports.test.ts` para o modelo canônico:
 * dinheiro em unidade mínima inteira, `createdAt`/`totalMinor`/`customerEmail`.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { type CanonicalItem, type CanonicalOrder } from '../../core/types'
import {
  newVsReturning,
  promoEffectiveness,
  salesByPeriod,
  topProductsABC,
} from '../../core/reports'

function makeOrder(
  partial: Partial<CanonicalOrder> & { orderId: string }
): CanonicalOrder {
  return {
    createdAt: '2026-01-15T12:00:00.000Z',
    status: 'paid',
    rawStatus: 'invoiced',
    totalMinor: 10000,
    currency: 'BRL',
    ...partial,
  }
}

function makeItem(
  partial: Partial<CanonicalItem> & { productId: string }
): CanonicalItem {
  return {
    skuId: `sku-${partial.productId}`,
    name: `Produto ${partial.productId}`,
    quantity: 1,
    unitPaidMinor: 10000,
    ...partial,
  }
}

// ============================================================================
// 1. salesByPeriod
// ============================================================================

describe('salesByPeriod', () => {
  // valores em CENTAVOS (unidade mínima), como no modelo canônico
  const orders: CanonicalOrder[] = [
    makeOrder({
      orderId: 'o1',
      totalMinor: 14990, // R$ 149,90
      createdAt: '2026-01-15T12:00:00Z', // 09h BRT -> dia 15
      paymentMethod: 'Visa',
      sellerName: 'loja-principal',
    }),
    makeOrder({
      orderId: 'o2',
      totalMinor: 5010, // R$ 50,10
      createdAt: '2026-01-16T01:00:00Z', // 22h BRT do dia 15 -> conta no dia 15!
      paymentMethod: 'Pix',
      sellerName: 'loja-principal',
    }),
    makeOrder({
      orderId: 'o3',
      totalMinor: 10000, // R$ 100,00
      createdAt: '2026-01-16T12:00:00Z', // 09h BRT -> dia 16
      paymentMethod: 'Visa',
      sellerName: 'seller-parceiro',
    }),
  ]

  const report = salesByPeriod(orders, 'day')

  test('converte centavos pra reais no total: 14990+5010+10000 centavos = R$ 300', () => {
    assert.equal(report.totalFaturamento, 300)
    assert.equal(report.totalPedidos, 3)
  })

  test('ticket médio geral correto (300 / 3 pedidos = 100)', () => {
    assert.equal(report.ticketMedioGeral, 100)
  })

  test('bucketing diário no fuso BRT: pedido à 01h UTC do dia 16 conta no dia 15', () => {
    assert.deepEqual(report.linhas, [
      { bucket: '2026-01-15', faturamento: 200, pedidos: 2, ticketMedio: 100 },
      { bucket: '2026-01-16', faturamento: 100, pedidos: 1, ticketMedio: 100 },
    ])
  })

  test('agrega por paymentMethod (ordenado por faturamento desc)', () => {
    assert.deepEqual(report.porPagamento, [
      { metodo: 'Visa', faturamento: 249.9, pedidos: 2 },
      { metodo: 'Pix', faturamento: 50.1, pedidos: 1 },
    ])
  })

  test('agrega por sellerName (ordenado por faturamento desc)', () => {
    assert.deepEqual(report.porSeller, [
      { seller: 'loja-principal', faturamento: 200, pedidos: 2 },
      { seller: 'seller-parceiro', faturamento: 100, pedidos: 1 },
    ])
  })

  test('pedido sem sellerName cai no rótulo "—"', () => {
    const semSeller = salesByPeriod(
      [makeOrder({ orderId: 'x1', totalMinor: 2500 })],
      'day'
    )
    assert.deepEqual(semSeller.porSeller, [
      { seller: '—', faturamento: 25, pedidos: 1 },
    ])
  })

  test('pedido sem paymentMethod não entra em porPagamento', () => {
    const semPgto = salesByPeriod(
      [makeOrder({ orderId: 'x2', totalMinor: 2500 })],
      'day'
    )
    assert.deepEqual(semPgto.porPagamento, [])
  })

  test('grão semanal e mensal usam bucketKey de core/time', () => {
    const mensal = salesByPeriod(orders, 'month')
    assert.deepEqual(mensal.linhas.map((l) => l.bucket), ['2026-01'])

    const semanal = salesByPeriod(orders, 'week')
    assert.deepEqual(semanal.linhas.map((l) => l.bucket), ['2026-W03'])
  })

  test('soma em inteiro não acumula erro de float (3 × 10,10 = 30,30)', () => {
    const centavos = salesByPeriod(
      [
        makeOrder({ orderId: 'c1', totalMinor: 1010 }),
        makeOrder({ orderId: 'c2', totalMinor: 1010 }),
        makeOrder({ orderId: 'c3', totalMinor: 1010 }),
      ],
      'day'
    )
    assert.equal(centavos.totalFaturamento, 30.3)
    assert.equal(centavos.ticketMedioGeral, 10.1)
  })

  test('conjunto vazio não explode e zera tudo', () => {
    const empty = salesByPeriod([], 'day')
    assert.equal(empty.totalFaturamento, 0)
    assert.equal(empty.totalPedidos, 0)
    assert.equal(empty.ticketMedioGeral, 0)
    assert.deepEqual(empty.linhas, [])
    assert.deepEqual(empty.porPagamento, [])
    assert.deepEqual(empty.porSeller, [])
  })
})

// ============================================================================
// 2. topProductsABC
// ============================================================================

describe('topProductsABC', () => {
  // Receita total: R$ 1.000
  //   prod-camiseta: R$ 800 (80%)      -> classe A (em DOIS skus: tamanhos P e M)
  //   prod-calca:    R$ 150 (95% acum) -> classe B
  //   prod-meia:     R$ 50  (100% acum)-> classe C
  const orders: CanonicalOrder[] = [
    makeOrder({
      orderId: 'o1',
      items: [
        makeItem({
          skuId: 'sku-camiseta-P',
          productId: 'prod-camiseta',
          name: 'Camiseta Básica',
          unitPaidMinor: 40000, // R$ 400
          quantity: 1,
        }),
        makeItem({
          skuId: 'sku-calca-42',
          productId: 'prod-calca',
          name: 'Calça Jeans',
          unitPaidMinor: 7500, // R$ 75
          quantity: 2, // R$ 150
        }),
      ],
    }),
    makeOrder({
      orderId: 'o2',
      items: [
        makeItem({
          skuId: 'sku-camiseta-M', // sku DIFERENTE, MESMO productId
          productId: 'prod-camiseta',
          name: 'Camiseta Básica',
          unitPaidMinor: 40000, // R$ 400
          quantity: 1,
        }),
        makeItem({
          skuId: 'sku-meia-unica',
          productId: 'prod-meia',
          name: 'Meia Esportiva',
          unitPaidMinor: 2500, // R$ 25
          quantity: 2, // R$ 50
        }),
      ],
    }),
  ]

  const rows = topProductsABC(orders)

  test('agrega dois skus (P e M) do MESMO productId numa linha só', () => {
    assert.equal(rows.length, 3)
    const camiseta = rows.find((r) => r.productId === 'prod-camiseta')!
    assert.equal(camiseta.receita, 800) // (40000*1 + 40000*1) / 100
    assert.equal(camiseta.quantidade, 2)
    assert.equal(camiseta.pedidos, 2) // apareceu em o1 e o2
    assert.equal(camiseta.nome, 'Camiseta Básica')
  })

  test('receita = unitPaidMinor × quantity ÷ 100', () => {
    const calca = rows.find((r) => r.productId === 'prod-calca')!
    assert.equal(calca.receita, 150) // 7500 * 2 / 100
    const meia = rows.find((r) => r.productId === 'prod-meia')!
    assert.equal(meia.receita, 50) // 2500 * 2 / 100
  })

  test('ordena por receita desc', () => {
    assert.deepEqual(rows.map((r) => r.productId), [
      'prod-camiseta',
      'prod-calca',
      'prod-meia',
    ])
    for (let i = 1; i < rows.length; i++) {
      assert.ok(rows[i].receita <= rows[i - 1].receita)
    }
  })

  test('percentualAcumulado é crescente e fecha em 100', () => {
    assert.deepEqual(rows.map((r) => r.percentualAcumulado), [80, 95, 100])
    for (let i = 1; i < rows.length; i++) {
      assert.ok(rows[i].percentualAcumulado > rows[i - 1].percentualAcumulado)
    }
  })

  test('classes ABC corretas: A até 80%, B até 95%, C o resto', () => {
    assert.deepEqual(rows.map((r) => r.classe), ['A', 'B', 'C'])
  })

  test('pedido sem items é ignorado', () => {
    const semItens = topProductsABC([makeOrder({ orderId: 'sem-itens' })])
    assert.deepEqual(semItens, [])
  })

  test('sem pedidos retorna []', () => {
    assert.deepEqual(topProductsABC([]), [])
  })
})

// ============================================================================
// 3. newVsReturning
// ============================================================================

describe('newVsReturning', () => {
  const orders: CanonicalOrder[] = [
    // cliente1: 2 pedidos -> recorrente
    makeOrder({ orderId: 'o1', customerEmail: 'cliente1@example.com' }),
    makeOrder({ orderId: 'o2', customerEmail: 'cliente1@example.com' }),
    // cliente2 e cliente3: 1 pedido cada -> novos
    makeOrder({ orderId: 'o3', customerEmail: 'cliente2@example.com' }),
    makeOrder({ orderId: 'o4', customerEmail: 'cliente3@example.com' }),
    // pedido SEM email: ignorado na classificação
    makeOrder({ orderId: 'o5' }),
  ]

  const report = newVsReturning(orders)

  test('classifica 2 novos e 1 recorrente, ignorando pedido sem email', () => {
    assert.equal(report.novos, 2)
    assert.equal(report.recorrentes, 1)
  })

  test('taxaRecompra = 1/3 = 33.33%', () => {
    assert.equal(report.taxaRecompra, 33.33)
  })

  test('aviso menciona a janela de ~24 meses da API', () => {
    assert.ok(report.aviso.includes('24 meses'))
  })

  test('sem pedidos: tudo zero, sem divisão por zero', () => {
    const empty = newVsReturning([])
    assert.equal(empty.novos, 0)
    assert.equal(empty.recorrentes, 0)
    assert.equal(empty.taxaRecompra, 0)
  })

  test('todos os pedidos sem email: nada classificado', () => {
    const anon = newVsReturning([
      makeOrder({ orderId: 'a1' }),
      makeOrder({ orderId: 'a2' }),
    ])
    assert.equal(anon.novos, 0)
    assert.equal(anon.recorrentes, 0)
    assert.equal(anon.taxaRecompra, 0)
  })
})

// ============================================================================
// 4. promoEffectiveness
// ============================================================================

describe('promoEffectiveness', () => {
  const orders: CanonicalOrder[] = [
    // pedido COM desconto: (20000-15000)*2/100 = R$ 100 de desconto
    makeOrder({
      orderId: 'o1',
      items: [
        makeItem({
          productId: 'prod-a',
          unitListMinor: 20000, // "de" R$ 200
          unitPaidMinor: 15000, // "por" R$ 150
          quantity: 2,
        }),
      ],
    }),
    // pedido SEM unitListMinor: conta como sem desconto
    makeOrder({
      orderId: 'o2',
      items: [
        makeItem({
          productId: 'prod-b',
          unitPaidMinor: 10000, // R$ 100, sem preço "de"
          quantity: 1,
        }),
      ],
    }),
  ]

  const report = promoEffectiveness(orders)

  test('desconto correto: (unitListMinor − unitPaidMinor) × qty ÷ 100', () => {
    assert.equal(report.descontoTotal, 100)
  })

  test('receita bruta soma o preço "de" (ou o pago quando ausente); líquida soma o pago', () => {
    // bruta: (20000*2 + 10000*1) / 100 = 400 + 100 = 500
    assert.equal(report.receitaBrutaSemDesconto, 500)
    // líquida: (15000*2 + 10000*1) / 100 = 300 + 100 = 400
    assert.equal(report.receitaLiquida, 400)
  })

  test('pedidosComDesconto conta só pedidos com desconto real', () => {
    assert.equal(report.pedidosComDesconto, 1)
  })

  test('percentualDescontoMedio = desconto/bruta = 100/500 = 20%', () => {
    assert.equal(report.percentualDescontoMedio, 20)
  })

  test('item com unitListMinor igual ao pago não conta como desconto', () => {
    const semPromo = promoEffectiveness([
      makeOrder({
        orderId: 'o9',
        items: [
          makeItem({
            productId: 'prod-c',
            unitListMinor: 9990,
            unitPaidMinor: 9990,
            quantity: 3,
          }),
        ],
      }),
    ])
    assert.equal(semPromo.pedidosComDesconto, 0)
    assert.equal(semPromo.descontoTotal, 0)
    assert.equal(semPromo.percentualDescontoMedio, 0)
  })

  test('observacao explica que não atribui desconto a promoções individuais', () => {
    assert.ok(report.observacao.includes('promoções individuais'))
  })

  test('sem pedidos: zera tudo sem divisão por zero', () => {
    const empty = promoEffectiveness([])
    assert.equal(empty.pedidosComDesconto, 0)
    assert.equal(empty.receitaBrutaSemDesconto, 0)
    assert.equal(empty.receitaLiquida, 0)
    assert.equal(empty.descontoTotal, 0)
    assert.equal(empty.percentualDescontoMedio, 0)
  })
})
