/**
 * Tradução VTEX -> modelo canônico.
 * -----------------------------------------------------------------------------
 * Este é o único lugar do adapter que conhece as duas linguagens ao mesmo tempo.
 * Funções puras, sem I/O: dá para testar cada regra isoladamente.
 *
 * Duas regras carregam quase todo o risco do domínio:
 *
 *  1. DINHEIRO: a VTEX já entrega inteiro em centavos. `value: 14990` É
 *     R$ 149,90. O canônico também é inteiro em unidade mínima, logo o mapper
 *     COPIA o número. Nada de `/100` aqui — a conversão para decimal acontece
 *     uma única vez, na borda de saída do relatório (`core/money.ts#toMajor`).
 *
 *  2. STATUS: o mapeamento tem default `paid` (ver `mapVtexStatus`).
 * -----------------------------------------------------------------------------
 */
import { type CanonicalItem, type CanonicalOrder, type CanonicalStatus } from '../../core/types'
import {
  type VtexOrderDetail,
  type VtexOrderItem,
  type VtexOrderSummary,
} from './raw-types'

/** Status VTEX que representam "nunca entrou dinheiro". */
const PENDING_STATUSES = new Set<string>([
  'window-to-change-payment',
  'payment-pending',
  'incomplete',
])

/**
 * Status VTEX de cancelamento.
 *
 * `cancellation-requested` entra junto com `canceled` de propósito: é o pedido
 * cujo cancelamento já foi PEDIDO e ainda não concluiu no workflow. Deixá-lo
 * fora (o que o default `paid` fazia) tem dois custos ao mesmo tempo — ele
 * conta como faturamento, e some do relatório de cancelados justamente na
 * janela em que o lojista ainda pode agir sobre ele.
 *
 * A distinção entre os dois não se perde: `rawStatus` chega intacto ao
 * relatório, que os quebra em linhas separadas (ver `canceledOrders`).
 *
 * ATENÇÃO — esta lista NÃO foi verificada contra uma conta real. O workflow da
 * VTEX é customizável e uma loja pode ter um status de cancelamento próprio
 * ('cancelado-pelo-cliente', 'cancelamento-antifraude'). Para conferir:
 *
 *   SELECT raw_status, count(*) FROM orders
 *   WHERE store_account = '<conta>' GROUP BY raw_status ORDER BY 2 DESC;
 *
 * Todo status de cancelamento que aparecer ali e não estiver aqui está sendo
 * contado como venda.
 */
const CANCELED_STATUSES = new Set<string>([
  'canceled',
  'cancellation-requested',
])

/**
 * Status VTEX -> status canônico.
 *
 * DECISÃO DE PRODUTO TRAVADA — não "conserte" isto sem discussão:
 * o default de qualquer status desconhecido é `paid`.
 *
 * O workflow da VTEX é customizável: uma loja pode ter 'aguardando-conferencia',
 * 'separacao-loja-3' ou qualquer nome inventado. Se o mapeamento fosse por
 * INCLUSÃO (lista de status "bons"), todo status novo cairia fora do relatório
 * e o faturamento encolheria em silêncio — o pior tipo de bug, porque ninguém
 * vê uma exceção, só um número menor.
 *
 * Mapeando o desconhecido como `paid`, o recorte continua sendo por EXCLUSÃO
 * (ver `core/scope.ts`): só some do relatório o que EXPLICITAMENTE sabemos que
 * não é venda. O erro possível passa a ser visível (um pedido a mais, auditável
 * via `rawStatus`) em vez de invisível.
 *
 * `refunded` não é produzido aqui de propósito: a VTEX não expõe estorno como
 * status de pedido no OMS — cancelamento pós-pagamento chega como 'canceled'.
 */
export function mapVtexStatus(status: string): CanonicalStatus {
  if (CANCELED_STATUSES.has(status)) return 'canceled'
  if (PENDING_STATUSES.has(status)) return 'pending'
  return 'paid'
}

/**
 * Pedido resumido da VTEX -> pedido canônico (sem itens).
 *
 * O e-mail pode chegar em dois lugares conforme a conta e o endpoint:
 * `clientEmail` no resumo, ou dentro de `clientProfileData`. Pode faltar nos
 * dois (conta com anonimização); o canônico aceita ausência.
 */
export function mapVtexOrder(raw: VtexOrderSummary): CanonicalOrder {
  const order: CanonicalOrder = {
    orderId: raw.orderId,
    createdAt: raw.creationDate,
    status: mapVtexStatus(raw.status),
    // status cru preservado ao lado: é o que permite auditar o default acima
    rawStatus: raw.status,
    // JÁ em centavos. Copiar, nunca reconverter.
    totalMinor: raw.value ?? raw.totalValue ?? 0,
    currency: 'BRL',
  }

  if (raw.paymentNames !== undefined) order.paymentMethod = raw.paymentNames
  // marketplace: o seller principal é o primeiro da lista
  const seller = raw.sellerNames?.[0]
  if (seller !== undefined) order.sellerName = seller

  const email = raw.clientEmail ?? raw.clientProfileData?.email
  if (email !== undefined) order.customerEmail = email

  if (raw.items !== undefined) order.items = raw.items.map(mapVtexItem)

  return order
}

/**
 * Campos do DETALHE (Get Order) que não vêm na listagem: endereço e atribuição.
 *
 * Devolve um objeto PARCIAL para o chamador mesclar no pedido, em vez de mutar:
 * `enrichVtexOrdersWithDetail` monta a cópia enriquecida num lugar só.
 *
 * Campo vazio é tratado como ausente (`|| undefined`): a VTEX manda string
 * vazia em `coupon` quando não houve cupom, e um cupom chamado "" viraria uma
 * linha própria no relatório, competindo com o bucket "Sem cupom".
 */
export function mapVtexOrderDetail(
  detail: VtexOrderDetail
): Partial<CanonicalOrder> {
  const out: Partial<CanonicalOrder> = {}

  const address = detail.shippingData?.address
  if (address?.state) out.shippingState = address.state
  if (address?.city) out.shippingCity = address.city

  const mkt = detail.marketingData
  if (mkt?.coupon) out.coupon = mkt.coupon
  if (mkt?.utmSource) out.utmSource = mkt.utmSource
  if (mkt?.utmCampaign) out.utmCampaign = mkt.utmCampaign

  return out
}

/**
 * Item da VTEX -> item canônico. Preços também já vêm em centavos.
 * `listPrice` ausente = item sem preço "de" (sem desconto a calcular).
 */
export function mapVtexItem(raw: VtexOrderItem): CanonicalItem {
  const item: CanonicalItem = {
    skuId: raw.id,
    productId: raw.productId,
    name: raw.name,
    quantity: raw.quantity,
    unitPaidMinor: raw.price,
  }
  if (raw.listPrice !== undefined) item.unitListMinor = raw.listPrice
  return item
}
