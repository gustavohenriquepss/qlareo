/**
 * orderStore.ts — a porta de persistência.
 * -----------------------------------------------------------------------------
 * Os relatórios passam a ler daqui em vez de bater na Orders API a cada
 * requisição. Uma implementação guarda em Postgres (produção); outra em memória
 * (teste e dev). O core e o adapter não conhecem esta interface — quem costura
 * as duas coisas é o sync (adapter -> store) e o servidor (store -> relatório).
 * -----------------------------------------------------------------------------
 */
import { type CanonicalOrder, type DateRange } from '../core'

export interface OrderQuery {
  storeAccount: string
  range: DateRange
  /** Incluir os itens de cada pedido (relatórios de produto/promoção). */
  withItems?: boolean
}

export interface OrderStore {
  /**
   * Insere ou atualiza pedidos (idempotente por store_account + orderId).
   * Se um pedido chega com `items`, o detalhe é persistido e marcado como
   * sincronizado; sem `items`, o cabeçalho é gravado e o detalhe fica pendente.
   */
  upsertOrders(storeAccount: string, orders: CanonicalOrder[]): Promise<void>

  /** Pedidos de um intervalo (created_at), opcionalmente com itens. */
  getOrders(query: OrderQuery): Promise<CanonicalOrder[]>

  /** Marca d'água do último sync desta loja (null se nunca sincronizou). */
  getSyncState(storeAccount: string): Promise<Date | null>
  setSyncState(storeAccount: string, lastSyncedAt: Date): Promise<void>
}
