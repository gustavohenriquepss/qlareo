/**
 * Testes do transporte standalone. `fetch` é mockado — nada sai para a rede.
 * Dados 100% sintéticos.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  FetchHttpClient,
  VtexHttpError,
  type VtexCredentials,
} from '../../transport/fetchHttpClient'

const creds: VtexCredentials = {
  account: 'minhaloja',
  appKey: 'vtexappkey-minhaloja-ABCDEF',
  appToken: 'SUPERSECRETTOKEN',
}

/** Constrói um fetch falso que registra a chamada e devolve o que for pedido. */
function fakeFetch(
  handler: (url: string, init: RequestInit) => { status?: number; json?: unknown; text?: string }
): { impl: typeof fetch; calls: Array<{ url: string; init: RequestInit }> } {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const safeInit = init ?? {}
    calls.push({ url, init: safeInit })
    const r = handler(url, safeInit)
    const status = r.status ?? 200
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => r.json,
      text: async () => r.text ?? '',
    } as Response
  }) as typeof fetch
  return { impl, calls }
}

describe('FetchHttpClient — construção', () => {
  test('exige account, appKey e appToken', () => {
    assert.throws(() => new FetchHttpClient({ ...creds, account: '' }), /account/)
    assert.throws(() => new FetchHttpClient({ ...creds, appKey: '  ' }), /appKey/)
    assert.throws(() => new FetchHttpClient({ ...creds, appToken: '' }), /appToken/)
  })
})

describe('FetchHttpClient — get', () => {
  test('monta a URL na conta certa e manda os headers de auth', async () => {
    const { impl, calls } = fakeFetch(() => ({ json: { ok: true } }))
    const http = new FetchHttpClient(creds, { fetchImpl: impl })

    await http.get('/api/oms/pvt/orders', { page: 1, per_page: 100 })

    assert.equal(calls.length, 1)
    const { url, init } = calls[0]
    assert.ok(url.startsWith('https://minhaloja.vtexcommercestable.com.br/api/oms/pvt/orders'))
    assert.ok(url.includes('page=1'))
    assert.ok(url.includes('per_page=100'))
    const headers = init.headers as Record<string, string>
    assert.equal(headers['X-VTEX-API-AppKey'], creds.appKey)
    assert.equal(headers['X-VTEX-API-AppToken'], creds.appToken)
  })

  test('serializa parâmetros numéricos e string como query', async () => {
    const { impl, calls } = fakeFetch(() => ({ json: {} }))
    const http = new FetchHttpClient(creds, { fetchImpl: impl })

    await http.get('/api/oms/pvt/orders', {
      f_creationDate: 'creationDate:[2026-01-01 TO 2026-01-31]',
      per_page: 100,
    })

    const url = new URL(calls[0].url)
    assert.equal(url.searchParams.get('per_page'), '100')
    assert.equal(
      url.searchParams.get('f_creationDate'),
      'creationDate:[2026-01-01 TO 2026-01-31]'
    )
  })

  test('devolve o JSON parseado no tipo pedido', async () => {
    const payload = { list: [{ orderId: 'o1' }], paging: { total: 1 } }
    const { impl } = fakeFetch(() => ({ json: payload }))
    const http = new FetchHttpClient(creds, { fetchImpl: impl })

    const body = await http.get<typeof payload>('/api/oms/pvt/orders', {})
    assert.deepEqual(body, payload)
  })

  test('respeita environment customizado (ambiente de teste/beta)', async () => {
    const { impl, calls } = fakeFetch(() => ({ json: {} }))
    const http = new FetchHttpClient(
      { ...creds, environment: 'vtexcommercebeta.com.br' },
      { fetchImpl: impl }
    )
    await http.get('/api/oms/pvt/orders', {})
    assert.ok(calls[0].url.startsWith('https://minhaloja.vtexcommercebeta.com.br/'))
  })

  test('status não-2xx vira VtexHttpError com status e path', async () => {
    const { impl } = fakeFetch(() => ({ status: 401, text: 'Unauthorized' }))
    const http = new FetchHttpClient(creds, { fetchImpl: impl })

    await assert.rejects(
      () => http.get('/api/oms/pvt/orders', {}),
      (err: unknown) => {
        assert.ok(err instanceof VtexHttpError)
        assert.equal(err.status, 401)
        assert.ok(err.path.includes('/api/oms/pvt/orders'))
        return true
      }
    )
  })

  test('NUNCA coloca o appToken na URL (evita vazamento em log de acesso)', async () => {
    const { impl, calls } = fakeFetch(() => ({ json: {} }))
    const http = new FetchHttpClient(creds, { fetchImpl: impl })
    await http.get('/api/oms/pvt/orders', { page: 1 })
    assert.ok(!calls[0].url.includes(creds.appToken))
    assert.ok(!calls[0].url.includes('AppToken'))
  })
})
