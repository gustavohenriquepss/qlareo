/**
 * reports.ts — orquestra adapter + core para cada relatório.
 * -----------------------------------------------------------------------------
 * Espelho do handler do app VTEX IO, mas independente de framework: recebe os
 * parâmetros já validados e devolve o objeto do relatório. A única linha que
 * conhece a plataforma é a que instancia o VtexAdapter — trocar de plataforma
 * (ou de transporte) é trocar essa linha.
 * -----------------------------------------------------------------------------
 */
import { VtexAdapter } from '../adapters/vtex'
import {
  type CanonicalOrder,
  type DateRange,
  type Grain,
  type PlatformAdapter,
  type SalesScope,
  filterByScope,
  newVsReturning,
  promoEffectiveness,
  salesByPeriod,
  topProductsABC,
} from '../core'
import { FetchHttpClient, type VtexCredentials } from '../transport/fetchHttpClient'

/** Teto dos relatórios que enriquecem item a item (uma request por pedido). */
export const ENRICH_CAP = 2000

export type ReportName =
  | 'sales-by-period'
  | 'new-vs-returning'
  | 'top-products'
  | 'promotions'

export interface ReportRequest {
  report: ReportName
  range: DateRange
  scope: SalesScope
  grain: Grain
}

export interface LimitExceeded {
  excedeuLimite: true
  totalPedidos: number
  limite: number
  mensagem: string
}

/** Fábrica de adapter por credencial. Injetável — em teste, um adapter falso. */
export type AdapterFactory = (creds: VtexCredentials) => PlatformAdapter

/**
 * Fábrica padrão: adapter VTEX sobre o transporte fetch. Um serviço multi-tenant
 * chamaria isto com as credenciais do tenant da requisição.
 */
export const vtexAdapterFactory: AdapterFactory = (creds) =>
  new VtexAdapter(new FetchHttpClient(creds))

export async function runReport(
  adapter: PlatformAdapter,
  req: ReportRequest
): Promise<unknown> {
  const raw = await adapter.fetchOrders(req.range)
  const scoped = filterByScope(raw, req.scope)

  if (req.report === 'sales-by-period') {
    return salesByPeriod(scoped, req.grain)
  }
  if (req.report === 'new-vs-returning') {
    return newVsReturning(scoped)
  }

  // Relatórios com detalhe de item: respeitam o teto antes de enriquecer.
  const over = overCap(scoped)
  if (over) return over

  const withItems = await adapter.enrichWithItems(scoped)
  if (req.report === 'top-products') {
    return { produtos: topProductsABC(withItems), totalPedidos: scoped.length }
  }
  return { ...promoEffectiveness(withItems), pedidosAnalisados: scoped.length }
}

function overCap(scoped: CanonicalOrder[]): LimitExceeded | null {
  if (scoped.length <= ENRICH_CAP) return null
  return {
    excedeuLimite: true,
    totalPedidos: scoped.length,
    limite: ENRICH_CAP,
    mensagem:
      `O período tem ${scoped.length} pedidos; este relatório detalha item a ` +
      `item e está limitado a ${ENRICH_CAP} por consulta. Escolha um período menor.`,
  }
}
