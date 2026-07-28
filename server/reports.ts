/**
 * reports.ts — gera cada relatório lendo do STORE local.
 * -----------------------------------------------------------------------------
 * Mudança de fundo do banco: os relatórios não consultam mais a Orders API a
 * cada requisição — leem do store, que o sync mantém atualizado. Some o teto de
 * 3.000 por consulta (o sync já contornou ao gravar) e, com histórico
 * acumulado, some também a janela de ~24 meses.
 *
 * Os relatórios de item (top produtos, promoções) leem os itens já
 * sincronizados; não há mais enriquecimento em tempo de requisição.
 * -----------------------------------------------------------------------------
 */
import {
  type DateRange,
  type Grain,
  type SalesScope,
  filterByScope,
  newVsReturning,
  promoEffectiveness,
  salesByPeriod,
  topProductsABC,
  topSkus,
} from '../core'
import { type OrderStore } from '../store/orderStore'

export type ReportName =
  | 'sales-by-period'
  | 'new-vs-returning'
  | 'top-products'
  | 'top-skus'
  | 'promotions'

export interface ReportRequest {
  report: ReportName
  range: DateRange
  scope: SalesScope
  grain: Grain
}

const ITEM_REPORTS: ReportName[] = ['top-products', 'top-skus', 'promotions']

export async function runReport(
  store: OrderStore,
  storeAccount: string,
  req: ReportRequest
): Promise<unknown> {
  const withItems = ITEM_REPORTS.includes(req.report)
  const orders = await store.getOrders({ storeAccount, range: req.range, withItems })
  const scoped = filterByScope(orders, req.scope)

  if (req.report === 'sales-by-period') {
    return salesByPeriod(scoped, req.grain)
  }
  if (req.report === 'new-vs-returning') {
    return newVsReturning(scoped)
  }

  // Relatórios de item: se há pedidos mas nenhum com detalhe, o período ainda
  // não foi sincronizado com itens — diga isso em vez de devolver zeros.
  if (scoped.length > 0 && !scoped.some((o) => o.items && o.items.length > 0)) {
    return {
      itensNaoSincronizados: true,
      totalPedidos: scoped.length,
      mensagem:
        'Os pedidos deste período ainda não têm detalhe de item sincronizado. ' +
        'Rode o sync com itens (npm run sync -- --items) para este intervalo.',
    }
  }

  if (req.report === 'top-products') {
    return { produtos: topProductsABC(scoped), totalPedidos: scoped.length }
  }
  if (req.report === 'top-skus') {
    return { skus: topSkus(scoped), totalPedidos: scoped.length }
  }
  return { ...promoEffectiveness(scoped), pedidosAnalisados: scoped.length }
}
