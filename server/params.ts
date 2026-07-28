/**
 * params.ts — validação pura da query string (sem depender de http).
 * Separada do servidor para ser testável sem subir socket.
 */
import { type DateRange, type Grain, type SalesScope } from '../core'
import { type ReportName, type ReportRequest } from './reports'

const REPORTS: ReportName[] = [
  'sales-by-period',
  'new-vs-returning',
  'top-products',
  'top-skus',
  'promotions',
]
const SCOPES: SalesScope[] = ['bruto', 'liquido', 'todos']
const GRAINS: Grain[] = ['day', 'week', 'month']

export interface ParseResult {
  ok: true
  value: ReportRequest
}
export interface ParseError {
  ok: false
  error: string
}

export function parseReportRequest(
  report: string,
  query: URLSearchParams
): ParseResult | ParseError {
  if (!REPORTS.includes(report as ReportName)) {
    return { ok: false, error: `Relatório desconhecido: "${report}".` }
  }

  const from = query.get('from')
  const to = query.get('to')
  const start = from ? new Date(from) : null
  const end = to ? new Date(to) : null

  if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) {
    return {
      ok: false,
      error: 'Parâmetros "from" e "to" devem ser datas ISO válidas, com from < to.',
    }
  }

  const scope = (query.get('scope') ?? 'liquido') as SalesScope
  if (!SCOPES.includes(scope)) {
    return { ok: false, error: `scope inválido: "${scope}". Use bruto, liquido ou todos.` }
  }

  const grain = (query.get('grain') ?? 'day') as Grain
  if (!GRAINS.includes(grain)) {
    return { ok: false, error: `grain inválido: "${grain}". Use day, week ou month.` }
  }

  const range: DateRange = { start, end }
  return { ok: true, value: { report: report as ReportName, range, scope, grain } }
}
