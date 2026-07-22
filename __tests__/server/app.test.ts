/**
 * Teste ponta-a-ponta do servidor HTTP — sobe o app com um adapter FALSO e
 * bate nele por HTTP real em localhost. Exercita roteamento, auth, validação e
 * o pipeline core inteiro, sem tocar a VTEX.
 */
import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { type AddressInfo } from 'node:net'
import { type Server } from 'node:http'

import { type AppConfig } from '../../server/config'
import { createApp } from '../../server/main'
import { type AdapterFactory } from '../../server/reports'
import { type CanonicalOrder } from '../../core'

const SAMPLE: CanonicalOrder[] = [
  {
    orderId: 'o1', createdAt: '2026-01-15T12:00:00Z', status: 'paid', rawStatus: 'invoiced',
    totalMinor: 40000, currency: 'BRL', paymentMethod: 'Visa', sellerName: 'loja', customerEmail: 'ana@example.com',
    items: [{ skuId: 's1', productId: 'p1', name: 'Camiseta', quantity: 1, unitPaidMinor: 40000, unitListMinor: 50000 }],
  },
  {
    orderId: 'o2', createdAt: '2026-01-15T18:00:00Z', status: 'paid', rawStatus: 'invoiced',
    totalMinor: 10000, currency: 'BRL', paymentMethod: 'Pix', sellerName: 'loja', customerEmail: 'ana@example.com',
    items: [{ skuId: 's2', productId: 'p2', name: 'Meia', quantity: 2, unitPaidMinor: 5000 }],
  },
]

/** Adapter falso: devolve SAMPLE, sem rede. */
const fakeAdapter: AdapterFactory = () => ({
  platform: 'fake',
  async fetchOrders() {
    return SAMPLE.map((o) => ({ ...o, items: undefined }))
  },
  async enrichWithItems(orders) {
    return orders.map((o) => ({ ...o, items: SAMPLE.find((s) => s.orderId === o.orderId)?.items }))
  },
})

const config: AppConfig = {
  port: 0,
  vtex: { account: 'minhaloja', appKey: 'k', appToken: 't' },
  apiKey: 'segredo-do-qlareo',
}

let server: Server
let base: string

before(async () => {
  server = createApp(config, fakeAdapter)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const { port } = server.address() as AddressInfo
  base = `http://localhost:${port}`
})

after(() => new Promise<void>((resolve) => server.close(() => resolve())))

const AUTH = { headers: { 'x-api-key': 'segredo-do-qlareo' } }
const PERIOD = 'from=2026-01-01&to=2026-01-31'

describe('servidor QLAREO', () => {
  test('/health responde sem exigir auth', async () => {
    const res = await fetch(`${base}/health`)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.status, 'ok')
  })

  test('rejeita sem api key (401)', async () => {
    const res = await fetch(`${base}/api/reports/sales-by-period?${PERIOD}`)
    assert.equal(res.status, 401)
  })

  test('rota inexistente responde 404', async () => {
    const res = await fetch(`${base}/api/foo`, AUTH)
    assert.equal(res.status, 404)
  })

  test('parâmetros inválidos respondem 400 com mensagem', async () => {
    const res = await fetch(`${base}/api/reports/sales-by-period?from=x&to=y`, AUTH)
    assert.equal(res.status, 400)
    assert.match((await res.json()).error, /datas ISO/)
  })

  test('sales-by-period devolve totais agregados', async () => {
    const res = await fetch(`${base}/api/reports/sales-by-period?${PERIOD}`, AUTH)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.totalFaturamento, 500) // 40000 + 10000 centavos
    assert.equal(body.totalPedidos, 2)
  })

  test('new-vs-returning identifica a cliente recorrente', async () => {
    const res = await fetch(`${base}/api/reports/new-vs-returning?${PERIOD}`, AUTH)
    const body = await res.json()
    assert.equal(body.recorrentes, 1) // Ana em o1 e o2
    assert.equal(body.novos, 0)
  })

  test('top-products agrega por produto e enriquece via adapter', async () => {
    const res = await fetch(`${base}/api/reports/top-products?${PERIOD}`, AUTH)
    const body = await res.json()
    assert.equal(body.produtos.length, 2)
    assert.equal(body.totalPedidos, 2)
    const camiseta = body.produtos.find((p: { productId: string }) => p.productId === 'p1')
    assert.equal(camiseta.receita, 400)
  })

  test('promotions calcula desconto a partir de listPrice vs price', async () => {
    const res = await fetch(`${base}/api/reports/promotions?${PERIOD}`, AUTH)
    const body = await res.json()
    // camiseta: (50000-40000)/100 = R$100 de desconto
    assert.equal(body.descontoTotal, 100)
    assert.equal(body.pedidosComDesconto, 1)
  })
})
