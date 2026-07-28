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
  canceledOrders,
  couponsAndSources,
  newVsReturning,
  promoEffectiveness,
  salesByPeriod,
  salesByRegion,
  topProductsABC,
  topSkus,
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

// Receita total: R$ 1.000. Por PRODUTO:
//   prod-camiseta: R$ 800 (80%)      -> classe A (em DOIS skus: tamanhos P e M)
//   prod-calca:    R$ 150 (95% acum) -> classe B
//   prod-meia:     R$ 50  (100% acum)-> classe C
//
// A mesma massa serve aos dois rankings de propósito: é ela que mostra o que
// `topSkus` enxerga e `topProductsABC` não (a camiseta é UMA linha classe A por
// produto, mas DUAS variações de R$ 400 cada por SKU).
//
// Os nomes dos dois skus de camiseta são DIFERENTES entre si, como na VTEX: o
// `items[].name` do Get Order é o nome do SKU e carrega a variação junto. Isso
// não é detalhe do fixture — é o que faz o rótulo do produto ser derivado em vez
// de copiado de um item ao acaso.
const itemOrders: CanonicalOrder[] = [
  makeOrder({
    orderId: 'o1',
    items: [
      makeItem({
        skuId: 'sku-camiseta-P',
        productId: 'prod-camiseta',
        name: 'Camiseta Básica - P',
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
        name: 'Camiseta Básica - M',
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

describe('topProductsABC', () => {
  const rows = topProductsABC(itemOrders)

  test('agrega dois skus (P e M) do MESMO productId numa linha só', () => {
    assert.equal(rows.length, 3)
    const camiseta = rows.find((r) => r.productId === 'prod-camiseta')!
    assert.equal(camiseta.receita, 800) // (40000*1 + 40000*1) / 100
    assert.equal(camiseta.quantidade, 2)
    assert.equal(camiseta.pedidos, 2) // apareceu em o1 e o2
    // rótulo do PRODUTO, não o de uma das variações ("- P" / "- M")
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
// 2a. topProductsABC — o RÓTULO do produto
// ============================================================================

describe('topProductsABC: nome do produto derivado das variações', () => {
  /** Um produto, N variações com os nomes dados. Devolve o rótulo da linha. */
  function rotuloDe(...nomes: string[]): string {
    const orders = nomes.map((name, i) =>
      makeOrder({
        orderId: `o${i}`,
        items: [makeItem({ skuId: `sku-${i}`, productId: 'prod-x', name })],
      })
    )
    return topProductsABC(orders)[0]!.nome
  }

  test('corta a variação em fronteira de PALAVRA, não de caractere', () => {
    // O caso que quebra prefixo comum por caractere: "40" e "41" compartilham
    // o "4", e o rótulo sairia "Tênis Runner Pro - 4".
    assert.equal(
      rotuloDe('Tênis Runner Pro - 40', 'Tênis Runner Pro - 41'),
      'Tênis Runner Pro'
    )
  })

  test('separador sobrando na ponta é removido; no meio do nome, preservado', () => {
    assert.equal(rotuloDe('Meia 35-38', 'Meia 39-42'), 'Meia')
    assert.equal(
      rotuloDe('Camiseta Dry-Fit P', 'Camiseta Dry-Fit G'),
      'Camiseta Dry-Fit'
    )
  })

  test('variação sem separador (cor no fim do nome) também é cortada', () => {
    assert.equal(rotuloDe('Mochila 20L Preta', 'Mochila 20L Azul'), 'Mochila 20L')
  })

  test('UMA variação só: nome inteiro, sem chute de corte', () => {
    // Com um sku não dá para saber o que ali é variação — e este é o caso mais
    // comum do lojista pequeno.
    assert.equal(rotuloDe('Boné Trail - único'), 'Boné Trail - único')
  })

  test('variações com nome idêntico devolvem esse nome', () => {
    assert.equal(rotuloDe('Garrafa Térmica 700ml', 'Garrafa Térmica 700ml'),
      'Garrafa Térmica 700ml')
  })

  test('sem prefixo comum (variação na frente): cai no primeiro nome', () => {
    assert.equal(rotuloDe('P - Camiseta', 'M - Camiseta'), 'P - Camiseta')
  })

  test('o rótulo não depende de qual variação apareceu primeiro', () => {
    // É a regressão que importa: com o nome vindo do primeiro item visto, mudar
    // o filtro de data mudava o rótulo do produto na tela.
    const direto = rotuloDe('Jaqueta Corta-Vento - P', 'Jaqueta Corta-Vento - G')
    const invertido = rotuloDe('Jaqueta Corta-Vento - G', 'Jaqueta Corta-Vento - P')
    assert.equal(direto, 'Jaqueta Corta-Vento')
    assert.equal(invertido, direto)
  })

  test('derivar o rótulo não mexe na matemática ABC', () => {
    const rows = topProductsABC(itemOrders)
    assert.deepEqual(rows.map((r) => r.receita), [800, 150, 50])
    assert.deepEqual(rows.map((r) => r.percentualAcumulado), [80, 95, 100])
    assert.deepEqual(rows.map((r) => r.classe), ['A', 'B', 'C'])
  })
})

// ============================================================================
// 2b. topSkus — o MESMO cálculo, chaveado por variação
// ============================================================================

describe('topSkus', () => {
  // Sobre `itemOrders`, agora por SKU:
  //   sku-camiseta-P: R$ 400 (40% acum)  -> A
  //   sku-camiseta-M: R$ 400 (80% acum)  -> A
  //   sku-calca-42:   R$ 150 (95% acum)  -> B
  //   sku-meia-unica: R$ 50  (100% acum) -> C
  const rows = topSkus(itemOrders)

  test('SEPARA o que topProductsABC agrega: P e M viram duas linhas', () => {
    assert.equal(rows.length, 4)
    assert.equal(topProductsABC(itemOrders).length, 3)

    const p = rows.find((r) => r.skuId === 'sku-camiseta-P')!
    const m = rows.find((r) => r.skuId === 'sku-camiseta-M')!
    assert.equal(p.receita, 400)
    assert.equal(m.receita, 400)
    assert.equal(p.pedidos, 1) // só em o1
    assert.equal(m.pedidos, 1) // só em o2
  })

  test('cada linha carrega o productId da variação', () => {
    const p = rows.find((r) => r.skuId === 'sku-camiseta-P')!
    const m = rows.find((r) => r.skuId === 'sku-camiseta-M')!
    assert.equal(p.productId, 'prod-camiseta')
    assert.equal(m.productId, 'prod-camiseta')
  })

  test('o nome do SKU mantém a variação — é o que distingue as linhas', () => {
    // O corte que `topProductsABC` faz no rótulo NÃO acontece aqui: sem o
    // "- P" / "- M", as duas linhas sairiam com o mesmo texto.
    const p = rows.find((r) => r.skuId === 'sku-camiseta-P')!
    const m = rows.find((r) => r.skuId === 'sku-camiseta-M')!
    assert.equal(p.nome, 'Camiseta Básica - P')
    assert.equal(m.nome, 'Camiseta Básica - M')
  })

  test('ABC é recalculada sobre a base de SKU, não herdada do produto', () => {
    // A camiseta é UMA linha classe A por produto (80% sozinha). Por SKU ela
    // vira duas de 40%, e o corte de 80% passa a incluir as duas — é uma
    // classificação diferente, não um recorte da anterior.
    assert.deepEqual(rows.map((r) => r.percentualAcumulado), [40, 80, 95, 100])
    assert.deepEqual(rows.map((r) => r.classe), ['A', 'A', 'B', 'C'])
  })

  test('a receita total bate com a do ranking por produto', () => {
    // Mesma massa, mesma soma: se os dois divergirem, um dos dois está errado.
    const porSku = rows.reduce((s, r) => s + r.receita, 0)
    const porProduto = topProductsABC(itemOrders).reduce((s, r) => s + r.receita, 0)
    assert.equal(porSku, porProduto)
    assert.equal(porSku, 1000)
  })

  test('pedido sem items é ignorado; sem pedidos retorna []', () => {
    assert.deepEqual(topSkus([makeOrder({ orderId: 'sem-itens' })]), [])
    assert.deepEqual(topSkus([]), [])
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

// ============================================================================
// 5. canceledOrders
// ============================================================================

describe('canceledOrders', () => {
  // 5 pedidos no período. Dois têm status canônico 'canceled', mas só UM foi
  // de fato cancelado (R$ 200): o outro está em 'cancellation-requested' e o
  // relatório o exclui de propósito. Taxa = 1/5 = 20%.
  const orders: CanonicalOrder[] = [
    makeOrder({ orderId: 'ok1', totalMinor: 10000, rawStatus: 'invoiced' }),
    makeOrder({ orderId: 'ok2', totalMinor: 10000, rawStatus: 'invoiced' }),
    makeOrder({
      orderId: 'pend',
      status: 'pending',
      rawStatus: 'payment-pending',
      totalMinor: 5000,
    }),
    makeOrder({
      orderId: 'canc1',
      status: 'canceled',
      rawStatus: 'canceled',
      totalMinor: 20000, // R$ 200
      createdAt: '2026-01-15T12:00:00Z', // 09h BRT -> dia 15
      paymentMethod: 'Boleto',
    }),
    makeOrder({
      orderId: 'canc2',
      status: 'canceled',
      rawStatus: 'cancellation-requested',
      totalMinor: 10000, // R$ 100
      createdAt: '2026-01-16T12:00:00Z', // 09h BRT -> dia 16
      paymentMethod: 'Boleto',
    }),
  ]

  const report = canceledOrders(orders, 'day')

  test('conta e soma só o cancelamento concluído, não o em curso', () => {
    // canc2 está em 'cancellation-requested' (em curso) e fica de fora.
    assert.equal(report.totalPedidos, 1)
    assert.equal(report.valorCancelado, 200) // 20000 / 100
  })

  test('a taxa usa TODOS os pedidos do período como denominador', () => {
    // 1 cancelado / 5 pedidos = 20%. Se o denominador fosse só o conjunto
    // já filtrado, a taxa daria 100% e não diria nada.
    assert.equal(report.pedidosNoPeriodo, 5)
    assert.equal(report.taxa, 20)
  })

  test('exclui cancellation-requested do relatório', () => {
    // O status canônico funde 'canceled' e 'cancellation-requested' (para
    // nenhum dos dois virar faturamento), mas este relatório é sobre o que de
    // fato foi cancelado: o pedido "em curso" não conta em nenhum número.
    assert.equal(report.totalPedidos, 1)
    assert.ok(!report.linhas.some((l) => l.bucket === '2026-01-16'))
    assert.deepEqual(report.porPagamento, [
      { metodo: 'Boleto', valor: 200, pedidos: 1 },
    ])
  })

  test('NUNCA expõe um campo chamado "faturamento"', () => {
    // Este dinheiro não entrou. Um campo com aquele nome acabaria somado ao
    // relatório de vendas por alguém montando planilha.
    assert.ok(!('faturamento' in report))
    assert.ok(!report.linhas.some((l) => 'faturamento' in l))
    assert.ok(!report.porPagamento.some((p) => 'faturamento' in p))
  })

  test('série temporal no fuso do relatório, ordenada', () => {
    assert.deepEqual(report.linhas, [
      { bucket: '2026-01-15', pedidos: 1, valor: 200 },
    ])
  })

  test('lista cada pedido cancelado — a fonte conferível dos totais', () => {
    // Só canc1 entrou; canc2 está em curso e é excluído também da lista.
    assert.deepEqual(report.pedidos, [
      { pedido: 'canc1', data: '2026-01-15', valor: 200, pagamento: 'Boleto' },
    ])
  })

  test('ordena a lista por data desc e rotula pedido sem pagamento', () => {
    const r = canceledOrders([
      makeOrder({
        orderId: 'antigo',
        status: 'canceled',
        rawStatus: 'canceled',
        totalMinor: 10000,
        createdAt: '2026-01-10T12:00:00Z',
        paymentMethod: 'Pix',
      }),
      makeOrder({
        orderId: 'recente-sem-pgto',
        status: 'canceled',
        rawStatus: 'canceled',
        totalMinor: 5000,
        createdAt: '2026-01-20T12:00:00Z',
        // sem paymentMethod: entra na lista mesmo assim, com rótulo '—'
      }),
    ])
    assert.deepEqual(r.pedidos, [
      { pedido: 'recente-sem-pgto', data: '2026-01-20', valor: 50, pagamento: '—' },
      { pedido: 'antigo', data: '2026-01-10', valor: 100, pagamento: 'Pix' },
    ])
  })

  test('período sem nenhum cancelamento: zeros, sem divisão por zero', () => {
    const limpo = canceledOrders([
      makeOrder({ orderId: 'ok', totalMinor: 10000 }),
    ])
    assert.equal(limpo.totalPedidos, 0)
    assert.equal(limpo.valorCancelado, 0)
    assert.equal(limpo.taxa, 0)
    assert.equal(limpo.pedidosNoPeriodo, 1)
    assert.deepEqual(limpo.linhas, [])
    assert.deepEqual(limpo.pedidos, [])
  })

  test('conjunto vazio não explode', () => {
    const empty = canceledOrders([])
    assert.equal(empty.totalPedidos, 0)
    assert.equal(empty.taxa, 0)
    assert.equal(empty.pedidosNoPeriodo, 0)
  })
})

// ============================================================================
// 6. salesByRegion
// ============================================================================

describe('salesByRegion', () => {
  const orders: CanonicalOrder[] = [
    makeOrder({ orderId: 'a', totalMinor: 60000, shippingState: 'SP' }),
    makeOrder({ orderId: 'b', totalMinor: 20000, shippingState: 'SP' }),
    makeOrder({ orderId: 'c', totalMinor: 10000, shippingState: 'RJ' }),
    // Pedido digital: legitimamente sem UF. NÃO é falta de sincronismo.
    makeOrder({ orderId: 'd', totalMinor: 10000 }),
  ]

  const report = salesByRegion(orders)

  test('agrupa por UF, ordenado por faturamento desc', () => {
    assert.deepEqual(report.linhas.map((l) => l.uf), [
      'SP',
      'RJ',
      'Sem UF informada',
    ])
    assert.equal(report.linhas[0].faturamento, 800) // 60000 + 20000
    assert.equal(report.linhas[0].pedidos, 2)
  })

  test('pedido sem UF vira LINHA, não é descartado', () => {
    // Descartar faria a soma das linhas não bater com o faturamento do período,
    // e dois números que não reconciliam custam a confiança nos dois.
    const soma = report.linhas.reduce((s, l) => s + l.faturamento, 0)
    assert.equal(soma, report.totalFaturamento)
    assert.equal(report.totalFaturamento, 1000)
    assert.equal(report.pedidosSemRegiao, 1)
  })

  test('participação e ticket médio por UF', () => {
    const sp = report.linhas.find((l) => l.uf === 'SP')!
    assert.equal(sp.participacao, 80) // 800 de 1000
    assert.equal(sp.ticketMedio, 400) // 800 / 2
  })

  test('conjunto vazio não divide por zero', () => {
    const empty = salesByRegion([])
    assert.deepEqual(empty.linhas, [])
    assert.equal(empty.totalFaturamento, 0)
    assert.equal(empty.pedidosSemRegiao, 0)
  })
})

// ============================================================================
// 7. couponsAndSources
// ============================================================================

describe('couponsAndSources', () => {
  const orders: CanonicalOrder[] = [
    makeOrder({
      orderId: 'a',
      totalMinor: 30000,
      coupon: 'BEMVINDO10',
      utmSource: 'google',
      utmCampaign: 'black-friday',
    }),
    makeOrder({
      orderId: 'b',
      totalMinor: 10000,
      coupon: 'BEMVINDO10',
      utmSource: 'google',
      utmCampaign: 'black-friday',
    }),
    // Sem cupom e sem UTM: o caso MAIS COMUM numa loja real.
    makeOrder({ orderId: 'c', totalMinor: 60000 }),
  ]

  const report = couponsAndSources(orders)

  test('"Sem cupom" é uma LINHA, e costuma ser a maior', () => {
    // Omiti-la faria a segunda maior linha parecer dominante.
    assert.deepEqual(report.porCupom, [
      { chave: 'Sem cupom', faturamento: 600, pedidos: 1, participacao: 60 },
      { chave: 'BEMVINDO10', faturamento: 400, pedidos: 2, participacao: 40 },
    ])
  })

  test('separa quem usou cupom do faturamento total', () => {
    assert.equal(report.pedidosComCupom, 2)
    assert.equal(report.faturamentoComCupom, 400)
    assert.equal(report.totalFaturamento, 1000)
    assert.equal(report.totalPedidos, 3)
  })

  test('pedido sem UTM cai em "Direto / não rastreado", não some', () => {
    const direto = report.porOrigem.find(
      (o) => o.chave === 'Direto / não rastreado'
    )!
    assert.equal(direto.faturamento, 600)
    const soma = report.porOrigem.reduce((s, o) => s + o.faturamento, 0)
    assert.equal(soma, report.totalFaturamento)
  })

  test('agrupa por campanha separado da origem', () => {
    const bf = report.porCampanha.find((c) => c.chave === 'black-friday')!
    assert.equal(bf.pedidos, 2)
    assert.equal(bf.faturamento, 400)
  })

  test('observacao declara que a atribuição é de último clique', () => {
    assert.ok(report.observacao.includes('último clique'))
  })

  test('conjunto vazio não divide por zero', () => {
    const empty = couponsAndSources([])
    assert.deepEqual(empty.porCupom, [])
    assert.equal(empty.totalFaturamento, 0)
    assert.equal(empty.pedidosComCupom, 0)
  })
})
