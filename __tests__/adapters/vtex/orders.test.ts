/**
 * Testes da busca do adapter VTEX — paginação, fatiamento por data e
 * enriquecimento. Sem rede: o `HttpClient` é o seam, e os fakes abaixo
 * reproduzem o comportamento REAL da API (inclusive o teto de 30 páginas).
 * Runner: nativo do Node (`node:test` + `node:assert/strict`).
 * Todos os dados são sintéticos.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { VtexAdapter } from '../../../adapters/vtex/index'
import { type HttpClient } from '../../../adapters/vtex/http'
import {
  type VtexListResponse,
  type VtexOrderItem,
  type VtexOrderSummary,
} from '../../../adapters/vtex/raw-types'
import { type CanonicalOrder } from '../../../core/types'

const MAX_PAGES = 30 // teto real da List Orders
const PER_PAGE = 100

// ============================================================================
// Fixtures
// ============================================================================

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

/** Gera `count` pedidos com creationDate distribuídas uniformemente no intervalo. */
function makeDataset(count: number, start: Date, end: Date): VtexOrderSummary[] {
  const span = end.getTime() - start.getTime()
  const orders: VtexOrderSummary[] = []
  for (let i = 0; i < count; i++) {
    // distribui estritamente DENTRO do intervalo (evita colar nas bordas)
    const t = start.getTime() + Math.floor((span * (i + 1)) / (count + 1))
    orders.push(
      makeRawOrder({
        orderId: `ord-${String(i).padStart(5, '0')}`,
        creationDate: new Date(t).toISOString(),
      })
    )
  }
  return orders
}

/**
 * Fake da List Orders: responde a GET /api/oms/pvt/orders respeitando
 * page/per_page/f_creationDate E o teto de 30 páginas — igual à API real:
 * se paging.total > 30*per_page, só as 30 primeiras páginas do filtro existem.
 */
class FakeListOrdersClient implements HttpClient {
  public calls: Array<{ path: string; params: Record<string, string | number> }> = []
  private dataset: VtexOrderSummary[]

  constructor(dataset: VtexOrderSummary[]) {
    // a API devolve ordenado por creationDate quando pedimos orderBy asc
    this.dataset = [...dataset].sort((a, b) =>
      a.creationDate.localeCompare(b.creationDate)
    )
  }

  async get<T>(path: string, params: Record<string, string | number>): Promise<T> {
    this.calls.push({ path, params })
    if (path !== '/api/oms/pvt/orders') {
      throw new Error(`FakeListOrdersClient: path inesperado ${path}`)
    }
    if (params.orderBy !== 'creationDate,asc') {
      throw new Error(`FakeListOrdersClient: orderBy inesperado ${params.orderBy}`)
    }

    const page = Number(params.page)
    const perPage = Number(params.per_page)

    // f_creationDate: `creationDate:[START TO END]`
    const filter = String(params.f_creationDate ?? '')
    const m = filter.match(/^creationDate:\[(.+) TO (.+)\]$/)
    if (!m) throw new Error(`FakeListOrdersClient: filtro inválido "${filter}"`)
    const start = new Date(m[1]).getTime()
    const end = new Date(m[2]).getTime()

    // range Lucene é inclusivo nas duas pontas
    const filtered = this.dataset.filter((o) => {
      const t = new Date(o.creationDate).getTime()
      return t >= start && t <= end
    })

    const total = filtered.length
    const pages = Math.ceil(total / perPage)

    // Teto da API real: páginas além da 30ª não existem pra este filtro.
    const list =
      page > MAX_PAGES ? [] : filtered.slice((page - 1) * perPage, page * perPage)

    const body: VtexListResponse = {
      list,
      paging: { total, pages, currentPage: page, perPage },
    }
    return body as unknown as T
  }
}

// ============================================================================
// fetchOrders — paginação e fatiamento recursivo por data
// ============================================================================

describe('VtexAdapter#fetchOrders', () => {
  const start = new Date('2026-01-01T00:00:00.000Z')
  const end = new Date('2026-01-31T00:00:00.000Z')
  const range = { start, end }

  test("expõe platform = 'vtex'", () => {
    assert.equal(new VtexAdapter(new FakeListOrdersClient([])).platform, 'vtex')
  })

  test('com <=3000 pedidos no intervalo, traz todos sem fatiar', async () => {
    const dataset = makeDataset(250, start, end)
    const http = new FakeListOrdersClient(dataset)

    const out = await new VtexAdapter(http).fetchOrders(range)

    assert.equal(out.length, 250)
    assert.equal(new Set(out.map((o) => o.orderId)).size, 250)
    assert.deepEqual(
      out.map((o) => o.orderId).sort(),
      dataset.map((o) => o.orderId).sort()
    )
  })

  test('devolve pedidos CANÔNICOS (centavos preservados, rawStatus, moeda)', async () => {
    const http = new FakeListOrdersClient([
      makeRawOrder({
        orderId: 'ord-1',
        value: 14990,
        status: 'separacao-loja-3',
        clientEmail: 'cliente@example.com',
        sellerNames: ['principal'],
        paymentNames: 'Visa',
      }),
    ])

    const [order] = await new VtexAdapter(http).fetchOrders(range)

    assert.equal(order.totalMinor, 14990)
    assert.equal(order.currency, 'BRL')
    assert.equal(order.status, 'paid') // status customizado desconhecido
    assert.equal(order.rawStatus, 'separacao-loja-3')
    assert.equal(order.customerEmail, 'cliente@example.com')
    assert.equal(order.sellerName, 'principal')
    assert.equal(order.paymentMethod, 'Visa')
    assert.equal(order.items, undefined) // fetchOrders nunca traz item
  })

  test('a query usa per_page=100 e o filtro f_creationDate no formato da VTEX', async () => {
    const http = new FakeListOrdersClient(makeDataset(150, start, end))

    await new VtexAdapter(http).fetchOrders(range)

    const pageCalls = http.calls.filter((c) => Number(c.params.per_page) > 1)
    assert.ok(pageCalls.length >= 2, 'esperava paginar em mais de uma página')
    for (const call of pageCalls) {
      assert.equal(call.params.per_page, PER_PAGE)
      assert.equal(
        call.params.f_creationDate,
        `creationDate:[${start.toISOString()} TO ${end.toISOString()}]`
      )
    }
  })

  test('com >3000 pedidos (4500), o fatiamento recursivo recupera TODOS sem duplicatas', async () => {
    const dataset = makeDataset(4500, start, end)
    const http = new FakeListOrdersClient(dataset)

    const out = await new VtexAdapter(http).fetchOrders(range)

    const gotIds = out.map((o) => o.orderId)
    // sem duplicatas
    assert.equal(new Set(gotIds).size, gotIds.length)
    // todos os 4500 recuperados, apesar do teto de 30 páginas por filtro
    assert.deepEqual(gotIds.sort(), dataset.map((o) => o.orderId).sort())
  })

  test('nenhuma chamada individual pede página além da 30ª', async () => {
    const http = new FakeListOrdersClient(makeDataset(4500, start, end))

    await new VtexAdapter(http).fetchOrders(range)

    for (const call of http.calls) {
      assert.ok(
        Number(call.params.page) <= MAX_PAGES,
        `pediu página ${call.params.page} (> ${MAX_PAGES})`
      )
    }
  })

  test('o fatiamento cobre o intervalo inteiro: nenhuma fatia sai das bordas', async () => {
    const http = new FakeListOrdersClient(makeDataset(4500, start, end))

    await new VtexAdapter(http).fetchOrders(range)

    for (const call of http.calls) {
      const m = String(call.params.f_creationDate).match(
        /^creationDate:\[(.+) TO (.+)\]$/
      )
      assert.ok(m)
      assert.ok(new Date(m![1]).getTime() >= start.getTime())
      assert.ok(new Date(m![2]).getTime() <= end.getTime())
    }
  })

  test('intervalo com 0 pedidos retorna [] e não pagina', async () => {
    const http = new FakeListOrdersClient([])

    const out = await new VtexAdapter(http).fetchOrders(range)

    assert.deepEqual(out, [])
    // só a sonda (per_page=1)
    assert.equal(http.calls.length, 1)
    assert.equal(http.calls[0].params.per_page, 1)
  })

  test('intervalo indivisível com >3000 pedidos trunca em 3000 e avisa, sem estourar a pilha', async () => {
    // todos os pedidos no MESMO instante, e range de start=end
    const instant = new Date('2026-01-10T12:00:00.000Z')
    const dataset = Array.from({ length: 3500 }, (_, i) =>
      makeRawOrder({
        orderId: `ord-${String(i).padStart(5, '0')}`,
        creationDate: instant.toISOString(),
      })
    )
    const http = new FakeListOrdersClient(dataset)

    const originalWarn = console.warn
    const warnings: string[] = []
    console.warn = (...args: unknown[]) => {
      warnings.push(args.join(' '))
    }
    try {
      const out = await new VtexAdapter(http).fetchOrders({
        start: instant,
        end: instant,
      })
      assert.equal(out.length, 3000)
      assert.ok(
        warnings.some((w) => w.includes('indivisível')),
        'esperava aviso de intervalo indivisível'
      )
    } finally {
      console.warn = originalWarn
    }
  })
})

// ============================================================================
// enrichWithDetail — itens preenchidos e concorrência respeitada
// ============================================================================

/** Fake do Get Order que conta chamadas em voo pra medir concorrência real. */
class FakeGetOrderClient implements HttpClient {
  public inFlight = 0
  public maxInFlight = 0
  public callCount = 0
  private itemsByOrderId: Map<string, VtexOrderItem[]>

  constructor(itemsByOrderId: Map<string, VtexOrderItem[]>) {
    this.itemsByOrderId = itemsByOrderId
  }

  async get<T>(path: string, _params: Record<string, string | number>): Promise<T> {
    const m = path.match(/^\/api\/oms\/pvt\/orders\/(.+)$/)
    if (!m) throw new Error(`FakeGetOrderClient: path inesperado ${path}`)
    const orderId = m[1]

    this.callCount++
    this.inFlight++
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight)

    // simula latência de rede pra deixar as chamadas coexistirem
    await new Promise((resolve) => setTimeout(resolve, 5))

    this.inFlight--
    const items = this.itemsByOrderId.get(orderId)
    if (!items) throw new Error(`FakeGetOrderClient: pedido desconhecido ${orderId}`)
    return { items } as unknown as T
  }
}

describe('VtexAdapter#enrichWithDetail', () => {
  function setup(orderCount: number) {
    const orders: CanonicalOrder[] = []
    const itemsByOrderId = new Map<string, VtexOrderItem[]>()
    for (let i = 0; i < orderCount; i++) {
      const orderId = `ord-${i}`
      orders.push({
        orderId,
        createdAt: '2026-01-10T12:00:00.000Z',
        status: 'paid',
        rawStatus: 'invoiced',
        totalMinor: 10000,
        currency: 'BRL',
      })
      itemsByOrderId.set(orderId, [
        {
          id: `sku-${i}`,
          productId: `prod-${i % 3}`,
          name: `Produto ${i % 3}`,
          quantity: 1,
          price: 9990,
          listPrice: 12990,
        },
      ])
    }
    return { orders, http: new FakeGetOrderClient(itemsByOrderId) }
  }

  test('preenche items de todos os pedidos com os itens do respectivo orderId', async () => {
    const { orders, http } = setup(10)

    const out = await new VtexAdapter(http).enrichWithDetail(orders, {
      enrichConcurrency: 3,
    })

    assert.equal(out.length, 10)
    for (const o of out) {
      assert.ok(o.items !== undefined)
      assert.equal(o.items!.length, 1)
      assert.equal(o.items![0].skuId, `sku-${o.orderId.replace('ord-', '')}`)
    }
    assert.equal(http.callCount, 10)
  })

  test('os itens vêm canônicos (skuId/unitPaidMinor/unitListMinor em centavos)', async () => {
    const { orders, http } = setup(1)

    const [order] = await new VtexAdapter(http).enrichWithDetail(orders)

    const item = order.items![0]
    assert.equal(item.skuId, 'sku-0')
    assert.equal(item.productId, 'prod-0')
    assert.equal(item.quantity, 1)
    assert.equal(item.unitPaidMinor, 9990)
    assert.equal(item.unitListMinor, 12990)
  })

  test('nunca excede a concorrência configurada', async () => {
    const { orders, http } = setup(13)

    await new VtexAdapter(http).enrichWithDetail(orders, { enrichConcurrency: 3 })

    assert.ok(http.maxInFlight <= 3, `maxInFlight foi ${http.maxInFlight}`)
    // sanidade: de fato paraleliza (não rodou serial)
    assert.ok(http.maxInFlight > 1, 'esperava paralelismo, rodou serial')
  })

  test('usa concorrência default (4) quando não configurada', async () => {
    const { orders, http } = setup(9)

    await new VtexAdapter(http).enrichWithDetail(orders)

    assert.ok(http.maxInFlight <= 4, `maxInFlight foi ${http.maxInFlight}`)
    assert.ok(http.maxInFlight > 1, 'esperava paralelismo, rodou serial')
  })

  test('preserva a ordem de entrada', async () => {
    const { orders, http } = setup(12)

    const out = await new VtexAdapter(http).enrichWithDetail(orders, {
      enrichConcurrency: 5,
    })

    assert.deepEqual(
      out.map((o) => o.orderId),
      orders.map((o) => o.orderId)
    )
  })

  test('não muta os pedidos de entrada', async () => {
    const { orders, http } = setup(2)

    await new VtexAdapter(http).enrichWithDetail(orders, { enrichConcurrency: 2 })

    for (const o of orders) assert.equal(o.items, undefined)
  })

  test('lista vazia não faz nenhuma chamada', async () => {
    const http = new FakeGetOrderClient(new Map())

    const out = await new VtexAdapter(http).enrichWithDetail([])

    assert.deepEqual(out, [])
    assert.equal(http.callCount, 0)
  })
})
