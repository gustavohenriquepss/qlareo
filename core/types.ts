/**
 * Modelo canônico de pedido — a fronteira do core.
 * -----------------------------------------------------------------------------
 * Nada aqui conhece VTEX (nem Shopify, nem Woo). Cada plataforma tem um adapter
 * que traduz o formato dela para estes tipos; a partir daqui, os relatórios
 * agregam sempre sobre a mesma forma.
 *
 * Duas decisões que evitam as classes de bug mais caras do domínio:
 *
 *  1. Dinheiro em UNIDADES MÍNIMAS INTEIRAS (centavos). Nunca float na
 *     travessia. A VTEX já entrega centavos; Shopify/Woo entregam string
 *     decimal ("149.90") — o adapter converte na entrada, e o core nunca
 *     precisa saber. Ver `money.ts`.
 *  2. Status CANÔNICO, com o status cru preservado ao lado. "O que conta como
 *     venda" é decisão de negócio e vira `SalesScope`, não uma lista de strings
 *     de plataforma espalhada pela agregação.
 * -----------------------------------------------------------------------------
 */

/**
 * Estado canônico de um pedido, reduzido ao que um relatório de vendas precisa
 * decidir: entrou dinheiro, saiu dinheiro, ou nunca entrou.
 *
 * `paid` é o default deliberado do mapeamento (ver `mapStatus` de cada adapter):
 * plataformas permitem status customizados, e classificar o desconhecido como
 * "pago" mantém o filtro por EXCLUSÃO — nenhum pedido some silenciosamente do
 * relatório porque a loja inventou um status no workflow dela.
 */
export type CanonicalStatus = 'paid' | 'canceled' | 'pending' | 'refunded'

/** Recorte de vendas. Decisão de negócio, explícita e configurável. */
export type SalesScope = 'bruto' | 'liquido' | 'todos'

export interface CanonicalItem {
  /** Identificador da variação (tamanho/cor). */
  skuId: string
  /** Identificador do PRODUTO. Relatórios de produto agrupam por aqui. */
  productId: string
  name: string
  quantity: number
  /** Preço efetivamente pago por unidade, em unidades mínimas inteiras. */
  unitPaidMinor: number
  /** Preço "de" por unidade, em unidades mínimas. Ausente = sem desconto. */
  unitListMinor?: number
}

export interface CanonicalOrder {
  orderId: string
  /** ISO 8601 em UTC. O bucketing por dia trunca no fuso do relatório. */
  createdAt: string
  status: CanonicalStatus
  /** Status original da plataforma. Preservado para auditoria e depuração. */
  rawStatus: string
  /** Total do pedido em unidades mínimas inteiras. */
  totalMinor: number
  /** ISO 4217 ('BRL'). O core não converte moeda; só não mistura. */
  currency: string
  paymentMethod?: string
  sellerName?: string
  /** Chave de identidade do cliente (e-mail). Pode faltar por privacidade. */
  customerEmail?: string
  /** Só preenchido pelos adapters quando o relatório pede detalhe de item. */
  items?: CanonicalItem[]
}

/** Intervalo fechado de datas. */
export interface DateRange {
  start: Date
  end: Date
}

export interface ReportOptions {
  scope?: SalesScope
  /** Fuso para truncar datas. Default America/Sao_Paulo. */
  timezone?: string
}
