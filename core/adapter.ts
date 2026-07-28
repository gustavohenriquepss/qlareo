/**
 * PlatformAdapter — a porta entre o core e cada plataforma de ecommerce.
 * -----------------------------------------------------------------------------
 * Um adapter tem UMA responsabilidade: entregar pedidos canônicos de um
 * intervalo. Tudo que é específico da plataforma — autenticação, formato de
 * paginação, tetos de API, vocabulário de status, representação de dinheiro —
 * fica atrás desta interface e nunca vaza para os relatórios.
 *
 * O core não sabe se por trás há a Orders API da VTEX (paginação por página com
 * teto de 3.000), um cursor do Shopify ou a REST do WooCommerce. Ele só pede
 * pedidos e agrega.
 * -----------------------------------------------------------------------------
 */
import { type CanonicalOrder, type DateRange } from './types'

export interface FetchOrdersOptions {
  /**
   * Concorrência do enriquecimento por item. Segure baixo: plataformas punem
   * rajada com 429 (na VTEX, chega a derrubar o Admin).
   */
  enrichConcurrency?: number
}

export interface PlatformAdapter {
  /** Identificador da plataforma ('vtex', 'shopify', ...). Aparece em log e UI. */
  readonly platform: string

  /**
   * Todos os pedidos do intervalo, já canônicos e SEM detalhe de item.
   * O adapter é responsável por driblar os limites de paginação da plataforma.
   */
  fetchOrders(range: DateRange, options?: FetchOrdersOptions): Promise<CanonicalOrder[]>

  /**
   * Preenche o DETALHE dos pedidos informados: `items` e os campos de
   * atribuição (`shippingState`, `coupon`, `utmSource`...). Separado de
   * `fetchOrders` porque costuma ser MUITO mais caro — na VTEX, uma request por
   * pedido — e só parte dos relatórios precisa.
   *
   * Chama-se `WithDetail`, e não `WithItems`, porque numa plataforma o mesmo
   * payload que traz os itens traz também endereço e campanha: o nome antigo
   * fazia parecer que sincronizar região custaria uma segunda passada.
   */
  enrichWithDetail(
    orders: CanonicalOrder[],
    options?: FetchOrdersOptions
  ): Promise<CanonicalOrder[]>
}
