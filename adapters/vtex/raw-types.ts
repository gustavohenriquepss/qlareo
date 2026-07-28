/**
 * Tipos CRUS da Orders API da VTEX (OMS).
 * -----------------------------------------------------------------------------
 * Estes tipos descrevem o que a VTEX manda no fio — nada aqui é canônico e nada
 * daqui pode vazar para o core. A tradução mora em `mapper.ts`.
 *
 * Duas armadilhas do formato, documentadas onde importa:
 *  - dinheiro já vem em CENTAVOS (inteiro). R$ 149,90 chega como 14990.
 *    Reconverter é o bug nº 1 do domínio.
 *  - `items` NÃO vem na List Orders, só no Get Order (um pedido por request).
 * -----------------------------------------------------------------------------
 */

/** Pedido na versão RESUMIDA, como vem da List Orders. */
export interface VtexOrderSummary {
  orderId: string
  /** ISO 8601 em UTC. */
  creationDate: string
  /** Status do workflow. Pode ser customizado pela loja. Ex.: 'invoiced'. */
  status: string
  /** Total do pedido EM CENTAVOS. */
  value: number
  /** Idem, em centavos. Presente em algumas contas/versões. */
  totalValue?: number
  /** Método(s) de pagamento, já no resumo. Ex.: 'Visa' ou 'Visa,Vale'. */
  paymentNames?: string
  /** Sellers do pedido (marketplace). O principal é o primeiro. */
  sellerNames?: string[]
  /** Só preenchido depois do enriquecimento via Get Order. */
  items?: VtexOrderItem[]
  /** Pode vir parcial (ou ausente) no resumo, dependendo da conta. */
  clientProfileData?: {
    email?: string
    document?: string
    firstName?: string
    lastName?: string
  }
  clientName?: string
  /** Alguns endpoints/contas trazem o e-mail direto no resumo. */
  clientEmail?: string
}

/** Item de um pedido. Disponível apenas via Get Order. */
export interface VtexOrderItem {
  /** skuId — a VARIAÇÃO (tamanho/cor). */
  id: string
  /** productId — agrupe relatório de produto por AQUI, não por skuId. */
  productId: string
  name: string
  quantity: number
  /** Preço pago por unidade, EM CENTAVOS. */
  price: number
  /** Preço "de" por unidade, em centavos. */
  listPrice?: number
  /** Preço "por" por unidade, em centavos. */
  sellingPrice?: number
}

export interface VtexPaging {
  total: number
  pages: number
  currentPage: number
  perPage: number
}

/** Envelope da List Orders. */
export interface VtexListResponse {
  list: VtexOrderSummary[]
  paging: VtexPaging
}

/** Endereço de entrega. Só no Get Order. */
export interface VtexShippingData {
  address?: {
    /** Sigla da UF ('SP'). A VTEX usa `state` para isso em contas BR. */
    state?: string
    city?: string
  }
}

/**
 * Atribuição de marketing. Só no Get Order.
 *
 * Ausente por completo no pedido que veio de tráfego direto e sem cupom — que é
 * a maioria em muitas lojas. Ausência aqui NÃO é sinal de falta de sincronismo.
 */
export interface VtexMarketingData {
  coupon?: string
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
}

/**
 * Envelope (parcial) do Get Order — só o que o enriquecimento consome.
 *
 * Os três blocos vêm na MESMA resposta: enriquecer com itens já traz endereço e
 * atribuição de graça, sem uma segunda request por pedido.
 */
export interface VtexOrderDetail {
  items: VtexOrderItem[]
  shippingData?: VtexShippingData
  marketingData?: VtexMarketingData
}
