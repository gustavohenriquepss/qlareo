/**
 * VtexAdapter — a implementação VTEX do `PlatformAdapter`.
 * -----------------------------------------------------------------------------
 * Fachada fina: recebe um `HttpClient` (o seam de transporte, ver `http.ts`) e
 * delega a busca para `orders.ts` e a tradução para `mapper.ts`. Tudo que é
 * específico da VTEX — teto de 30 páginas, centavos, vocabulário de status,
 * itens só no Get Order — para aqui e não vaza para o core.
 *
 * Uso em app VTEX IO:
 *   const adapter = new VtexAdapter(new JanusHttpClient(ctx))
 * Uso standalone:
 *   const adapter = new VtexAdapter(new AxiosHttpClient({ account, appKey, appToken }))
 * -----------------------------------------------------------------------------
 */
import { type FetchOrdersOptions, type PlatformAdapter } from '../../core/adapter'
import { type CanonicalOrder, type DateRange } from '../../core/types'
import { type HttpClient } from './http'
import { enrichVtexOrdersWithItems, fetchVtexOrders } from './orders'

export class VtexAdapter implements PlatformAdapter {
  readonly platform = 'vtex'

  /**
   * Campo explícito em vez de "parameter property" (`private readonly http` no
   * construtor): o type stripping do Node roda em modo strip-only e não gera as
   * atribuições implícitas que aquela sintaxe exige.
   */
  private readonly http: HttpClient

  constructor(http: HttpClient) {
    this.http = http
  }

  /** Pedidos canônicos do intervalo, sem detalhe de item. */
  fetchOrders(range: DateRange, options?: FetchOrdersOptions): Promise<CanonicalOrder[]> {
    return fetchVtexOrders(this.http, range, options)
  }

  /** Preenche `items`. Uma request por pedido — só chame quando o relatório pedir. */
  enrichWithItems(
    orders: CanonicalOrder[],
    options?: FetchOrdersOptions
  ): Promise<CanonicalOrder[]> {
    return enrichVtexOrdersWithItems(this.http, orders, options)
  }
}

export { type HttpClient } from './http'
export { mapVtexItem, mapVtexOrder, mapVtexStatus } from './mapper'
export {
  DEFAULT_ENRICH_CONCURRENCY,
  LIST_ORDERS_PATH,
  MAX_PAGES,
  MAX_PER_SLICE,
  PER_PAGE,
  enrichVtexOrdersWithItems,
  fetchVtexOrders,
} from './orders'
export {
  type VtexListResponse,
  type VtexOrderDetail,
  type VtexOrderItem,
  type VtexOrderSummary,
  type VtexPaging,
} from './raw-types'
