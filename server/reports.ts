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
  canceledOrders,
  couponsAndSources,
  filterByScope,
  newVsReturning,
  promoEffectiveness,
  salesByPeriod,
  salesByRegion,
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
  | 'canceled-orders'
  | 'sales-by-region'
  | 'coupons-and-sources'

export interface ReportRequest {
  report: ReportName
  range: DateRange
  scope: SalesScope
  grain: Grain
}

/**
 * Relatórios que exigem o pedido ENRIQUECIDO (o Get Order da VTEX).
 *
 * Região e atribuição entram aqui mesmo não usando `items`: os campos deles vêm
 * do MESMO payload, então `items_synced` é o sinal correto para os cinco. É por
 * isso que a migration 002 rebaixa esse booleano — o detalhe antigo foi buscado
 * por um código que não lia UF nem cupom, e listar esses pedidos como
 * sincronizados reportaria a lacuna como se fosse dado.
 */
const DETAIL_REPORTS: ReportName[] = [
  'top-products',
  'top-skus',
  'promotions',
  'sales-by-region',
  'coupons-and-sources',
]

export async function runReport(
  store: OrderStore,
  storeAccount: string,
  req: ReportRequest
): Promise<unknown> {
  const withItems = DETAIL_REPORTS.includes(req.report)
  const orders = await store.getOrders({ storeAccount, range: req.range, withItems })

  // EXCEÇÃO DELIBERADA à regra "todo relatório passa por filterByScope".
  //
  // Este relatório é SOBRE os pedidos que o recorte remove: `liquido` (o default
  // da interface) exclui cancelados, então filtrar antes devolveria uma tela
  // vazia sempre. E a taxa de cancelamento precisa do total de pedidos do
  // período como denominador — informação que um conjunto já filtrado perdeu.
  //
  // Não "conserte" isto passando `scoped`: o recorte por status acontece dentro
  // de `canceledOrders`. Pelo mesmo motivo, a interface esconde o controle de
  // Recorte nesta rota (ver web/components/FilterBar.tsx).
  if (req.report === 'canceled-orders') {
    return canceledOrders(orders, req.grain)
  }

  const scoped = filterByScope(orders, req.scope)

  if (req.report === 'sales-by-period') {
    return salesByPeriod(scoped, req.grain)
  }
  if (req.report === 'new-vs-returning') {
    return newVsReturning(scoped)
  }

  // Relatórios de detalhe: se há pedidos mas nenhum com detalhe, o período ainda
  // não foi sincronizado — diga isso em vez de devolver zeros.
  //
  // O teste é a presença de `items`, e vale também para região e atribuição: os
  // três blocos vêm do mesmo Get Order, então "nenhum item" implica "nenhuma UF
  // e nenhum cupom". O contrário NÃO vale, e é por isso que o teste não pode ser
  // "nenhuma UF": pedido digital não tem endereço e compra sem cupom é o caso
  // comum — ausência desses campos é resultado, não lacuna.
  if (scoped.length > 0 && !scoped.some((o) => o.items && o.items.length > 0)) {
    return {
      itensNaoSincronizados: true,
      totalPedidos: scoped.length,
      mensagem:
        'Os pedidos deste período ainda não têm detalhe sincronizado. ' +
        'Rode o sync com itens (npm run sync -- --items) para este intervalo.',
    }
  }

  if (req.report === 'top-products') {
    return { produtos: topProductsABC(scoped), totalPedidos: scoped.length }
  }
  if (req.report === 'top-skus') {
    return { skus: topSkus(scoped), totalPedidos: scoped.length }
  }
  if (req.report === 'sales-by-region') {
    return salesByRegion(scoped)
  }
  if (req.report === 'coupons-and-sources') {
    return couponsAndSources(scoped)
  }
  return { ...promoEffectiveness(scoped), pedidosAnalisados: scoped.length }
}
