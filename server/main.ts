/**
 * main.ts — servidor HTTP standalone do QLAREO.
 * -----------------------------------------------------------------------------
 * `http` nativo do Node, sem framework — coerente com a postura do projeto de
 * dependência mínima. Expõe os relatórios em GET /api/reports/:report,
 * protegidos por uma api key própria, consultando a VTEX via appKey/appToken.
 *
 *   GET /api/reports/sales-by-period?from=ISO&to=ISO&scope=liquido&grain=day
 *   GET /api/reports/new-vs-returning?from&to&scope
 *   GET /api/reports/top-products?from&to&scope
 *   GET /api/reports/top-skus?from&to&scope
 *   GET /api/reports/promotions?from&to&scope
 *   GET /api/reports/canceled-orders?from&to&grain   (ignora `scope` — ver reports.ts)
 *   GET /health
 * -----------------------------------------------------------------------------
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

import { type OrderStore } from '../store/orderStore'
import { type AppConfig } from './config'
import { parseReportRequest } from './params'
import { runReport } from './reports'

const REPORTS_PREFIX = '/api/reports/'

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

/** Confere a api key do próprio QLAREO, quando configurada. */
function authorized(req: IncomingMessage, config: AppConfig): boolean {
  if (!config.apiKey) return true // sem chave definida = liberado (só dev)
  return req.headers['x-api-key'] === config.apiKey
}

export function createApp(config: AppConfig, store: OrderStore) {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)

      if (req.method === 'GET' && url.pathname === '/health') {
        return sendJson(res, 200, { status: 'ok', account: config.vtex.account })
      }

      if (req.method !== 'GET' || !url.pathname.startsWith(REPORTS_PREFIX)) {
        return sendJson(res, 404, { error: 'Rota não encontrada.' })
      }

      if (!authorized(req, config)) {
        return sendJson(res, 401, { error: 'Credencial de acesso inválida ou ausente.' })
      }

      const report = url.pathname.slice(REPORTS_PREFIX.length)
      const parsed = parseReportRequest(report, url.searchParams)
      if (!parsed.ok) {
        return sendJson(res, 400, { error: parsed.error })
      }

      const result = await runReport(store, config.vtex.account, parsed.value)
      return sendJson(res, 200, result)
    } catch (err) {
      // Nunca vaze o token num corpo de erro.
      const message = err instanceof Error ? err.message : 'Erro interno.'
      return sendJson(res, 500, { error: message })
    }
  })
}
