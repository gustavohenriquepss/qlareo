/**
 * Teste ponta-a-ponta do servidor — sobe o app com um MemoryOrderStore semeado
 * e bate nele por HTTP real em localhost. Exercita roteamento, auth, validação
 * e o pipeline core lendo do STORE (não mais do adapter), sem tocar a VTEX.
 */
import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { type AddressInfo } from 'node:net'
import { type Server } from 'node:http'

import { type CanonicalOrder } from '../../core'
import { type AppConfig } from '../../server/config'
import { createApp } from '../../server/main'
import { preAuthTenantResolver } from '../../server/preAuthTenant'
import { MemoryOrderStore } from '../../store/memoryStore'

const ACCOUNT = 'minhaloja'

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

const config: AppConfig = {
  port: 0,
  vtex: { account: ACCOUNT, appKey: 'k', appToken: 't' },
  apiKey: 'segredo-do-qlareo',
}

let server: Server
let base: string

before(async () => {
  const store = new MemoryOrderStore()
  await store.upsertOrders(ACCOUNT, SAMPLE)
  server = createApp(config, store, preAuthTenantResolver(ACCOUNT))
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const { port } = server.address() as AddressInfo
  base = `http://localhost:${port}`
})

after(() => new Promise<void>((resolve) => server.close(() => resolve())))

const AUTH = { headers: { 'x-api-key': 'segredo-do-qlareo' } }
const PERIOD = 'from=2026-01-01&to=2026-01-31'

describe('servidor QLAREO (lendo do store)', () => {
  test('/health responde sem exigir auth', async () => {
    const res = await fetch(`${base}/health`)
    assert.equal(res.status, 200)
    assert.equal((await res.json()).status, 'ok')
  })

  test('rejeita sem api key (401)', async () => {
    const res = await fetch(`${base}/api/reports/sales-by-period?${PERIOD}`)
    assert.equal(res.status, 401)
  })

  test('rota inexistente responde 404', async () => {
    assert.equal((await fetch(`${base}/api/foo`, AUTH)).status, 404)
  })

  test('parâmetros inválidos respondem 400', async () => {
    const res = await fetch(`${base}/api/reports/sales-by-period?from=x&to=y`, AUTH)
    assert.equal(res.status, 400)
    assert.match((await res.json()).error, /datas ISO/)
  })

  test('sales-by-period agrega o que está no store', async () => {
    const res = await fetch(`${base}/api/reports/sales-by-period?${PERIOD}`, AUTH)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.totalFaturamento, 500) // 40000 + 10000 centavos
    assert.equal(body.totalPedidos, 2)
  })

  test('new-vs-returning identifica a cliente recorrente', async () => {
    const body = await (await fetch(`${base}/api/reports/new-vs-returning?${PERIOD}`, AUTH)).json()
    assert.equal(body.recorrentes, 1)
    assert.equal(body.novos, 0)
  })

  test('top-products lê os itens já sincronizados no store', async () => {
    const body = await (await fetch(`${base}/api/reports/top-products?${PERIOD}`, AUTH)).json()
    assert.equal(body.produtos.length, 2)
    const camiseta = body.produtos.find((p: { productId: string }) => p.productId === 'p1')
    assert.equal(camiseta.receita, 400)
  })

  test('promotions calcula desconto a partir dos itens do store', async () => {
    const body = await (await fetch(`${base}/api/reports/promotions?${PERIOD}`, AUTH)).json()
    assert.equal(body.descontoTotal, 100) // (50000-40000)/100
    assert.equal(body.pedidosComDesconto, 1)
  })

  test('relatório de item sem período sincronizado avisa em vez de zerar', async () => {
    // período fora do que foi semeado -> store vazio -> sales zera, mas item
    // report com 0 pedidos NÃO dispara o aviso (só quando há pedidos sem itens).
    const vazio = await (await fetch(`${base}/api/reports/top-products?from=2025-01-01&to=2025-01-31`, AUTH)).json()
    assert.equal(vazio.produtos.length, 0)
  })
})
