/**
 * Busca de pedidos na Orders API da VTEX.
 * -----------------------------------------------------------------------------
 * Resolve os dois problemas estruturais do OMS, e é por isso que este código
 * existe como adapter em vez de virar duas linhas no relatório:
 *
 *  1. TETO DE PAGINAÇÃO. A List Orders devolve no máximo 30 páginas. Com
 *     per_page=100, são 3.000 pedidos POR CONSULTA DE FILTRO — passou disso, a
 *     API simplesmente não entrega (a página 31 vem vazia, sem erro). A saída é
 *     fatiar o INTERVALO DE DATAS recursivamente até cada fatia caber em 3.000.
 *     Como cada fatia é um filtro diferente, cada uma ganha seu próprio teto.
 *
 *  2. DETALHE SÓ NO GET ORDER. SKU/quantidade/preço, endereço de entrega e
 *     atribuição (cupom, UTM) não vêm na List; é uma request por pedido. Caro.
 *     Fica separado em `enrichVtexOrdersWithDetail`, com concorrência limitada —
 *     rajada no OMS vira 429 e chega a derrubar o Admin.
 *
 * Sem filtro de status na query (`f_status`) DE PROPÓSITO: o recorte de vendas é
 * por EXCLUSÃO no core (`core/scope.ts`), o que não exige conhecer a lista de
 * status válidos de um workflow que a loja pode ter customizado.
 * -----------------------------------------------------------------------------
 */
import { type FetchOrdersOptions } from '../../core/adapter'
import { type CanonicalOrder, type DateRange } from '../../core/types'
import { type HttpClient } from './http'
import { mapVtexItem, mapVtexOrder, mapVtexOrderDetail } from './mapper'
import {
  type VtexListResponse,
  type VtexOrderDetail,
  type VtexOrderSummary,
} from './raw-types'

export const LIST_ORDERS_PATH = '/api/oms/pvt/orders'
export const PER_PAGE = 100
/** Teto duro da List Orders. Pedir a página 31 não devolve nada. */
export const MAX_PAGES = 30
/** 3.000 — o que uma única consulta de filtro consegue entregar. */
export const MAX_PER_SLICE = PER_PAGE * MAX_PAGES
/** Concorrência default do enriquecimento. Baixa por causa do 429. */
export const DEFAULT_ENRICH_CONCURRENCY = 4

/**
 * Todos os pedidos do intervalo, canônicos e SEM itens.
 * Faz o fatiamento por data quando o intervalo estoura o teto de 3.000.
 */
export async function fetchVtexOrders(
  http: HttpClient,
  range: DateRange,
  _options: FetchOrdersOptions = {}
): Promise<CanonicalOrder[]> {
  const raw = await fetchRawInRange(http, range.start, range.end)
  return raw.map(mapVtexOrder)
}

/**
 * Recursão do fatiamento. Trabalha no formato cru para adiar o mapeamento até
 * depois da deduplicação (fatias adjacentes compartilham a borda: o range do
 * Lucene é inclusivo nas duas pontas, então o pedido exatamente no ponto de
 * corte aparece nas duas metades).
 */
async function fetchRawInRange(
  http: HttpClient,
  start: Date,
  end: Date
): Promise<VtexOrderSummary[]> {
  // Sonda barata: per_page=1 só para ler `paging.total` do intervalo.
  const probe = await listOrders(http, start, end, 1, 1)
  const total = probe.paging.total

  if (total === 0) return []

  if (total <= MAX_PER_SLICE) {
    return paginateSlice(http, start, end)
  }

  const mid = new Date((start.getTime() + end.getTime()) / 2)

  // Caso degenerado: intervalo que não dá mais para dividir (mesmo instante nas
  // duas pontas, ou diferença de 1ms) com mais de 3.000 pedidos. Aí a API não
  // tem como entregar o resto — trunca em 3.000 e avisa alto.
  if (mid.getTime() <= start.getTime() || mid.getTime() >= end.getTime()) {
    console.warn(
      `[vtex/orders] Intervalo indivisível com ${total} pedidos (>${MAX_PER_SLICE}). ` +
        `Retornando os primeiros ${MAX_PER_SLICE}. Considere granularidade menor.`
    )
    return paginateSlice(http, start, end)
  }

  const [left, right] = await Promise.all([
    fetchRawInRange(http, start, mid),
    fetchRawInRange(http, mid, end),
  ])
  return dedupeById([...left, ...right])
}

/** Pagina uma fatia que já se sabe caber no teto. */
async function paginateSlice(
  http: HttpClient,
  start: Date,
  end: Date
): Promise<VtexOrderSummary[]> {
  const first = await listOrders(http, start, end, 1, PER_PAGE)
  const all = [...first.list]
  // `Math.min` com MAX_PAGES é o que garante que nunca pedimos a página 31.
  const pages = Math.min(first.paging.pages, MAX_PAGES)

  for (let page = 2; page <= pages; page++) {
    const res = await listOrders(http, start, end, page, PER_PAGE)
    all.push(...res.list)
  }
  return all
}

/** Uma chamada crua à List Orders. */
function listOrders(
  http: HttpClient,
  start: Date,
  end: Date,
  page: number,
  perPage: number
): Promise<VtexListResponse> {
  return http.get<VtexListResponse>(LIST_ORDERS_PATH, {
    page,
    per_page: perPage,
    // ordem estável: sem isso, a paginação pode repetir/pular registros
    orderBy: 'creationDate,asc',
    f_creationDate: `creationDate:[${start.toISOString()} TO ${end.toISOString()}]`,
  })
}

/**
 * Preenche o DETALHE do pedido via Get Order: itens, endereço de entrega e
 * atribuição de marketing (cupom, UTM). Uma request por pedido, com no máximo
 * `enrichConcurrency` requests em voo. Pool de workers em vez de lotes fixos:
 * mantém a concorrência saturada sem esperar o pedido mais lento do lote.
 *
 * Os três blocos vêm na MESMA resposta — endereço e cupom não custam request
 * nenhuma além da que já se pagava pelos itens. Foi por isso que a função
 * deixou de se chamar `...WithItems`: o nome antigo passou a esconder metade do
 * que ela traz, e o custo de sincronizar região viraria uma decisão invisível.
 *
 * Não muta a entrada — devolve cópias, na mesma ordem.
 */
export async function enrichVtexOrdersWithDetail(
  http: HttpClient,
  orders: CanonicalOrder[],
  options: FetchOrdersOptions = {}
): Promise<CanonicalOrder[]> {
  const configured = options.enrichConcurrency ?? DEFAULT_ENRICH_CONCURRENCY
  const concurrency = Math.max(1, Math.min(configured, orders.length))
  if (orders.length === 0) return []

  const out = new Array<CanonicalOrder>(orders.length)
  let next = 0

  async function worker(): Promise<void> {
    for (;;) {
      const i = next++
      if (i >= orders.length) return
      const order = orders[i]
      const detail = await http.get<VtexOrderDetail>(
        `${LIST_ORDERS_PATH}/${order.orderId}`,
        {}
      )
      out[i] = {
        ...order,
        ...mapVtexOrderDetail(detail),
        items: (detail.items ?? []).map(mapVtexItem),
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  return out
}

/** Última linha de defesa contra duplicata na junção de fatias. */
function dedupeById(orders: VtexOrderSummary[]): VtexOrderSummary[] {
  const seen = new Map<string, VtexOrderSummary>()
  for (const o of orders) seen.set(o.orderId, o)
  return [...seen.values()]
}
