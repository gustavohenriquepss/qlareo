/**
 * memoryStore.ts — OrderStore em memória.
 * -----------------------------------------------------------------------------
 * Implementação de referência do contrato: usada em teste e no modo dev (sem
 * DATABASE_URL). Guarda a mesma semântica que a versão Postgres deve respeitar,
 * então serve de espelho executável do comportamento esperado.
 *
 * Isolamento por store_account é respeitado aqui do mesmo jeito: cada loja tem
 * seu próprio mapa; nunca se mistura pedido de uma loja com o de outra.
 * -----------------------------------------------------------------------------
 */
import { type CanonicalOrder } from '../core'
import { type OrderQuery, type OrderStore } from './orderStore'

export class MemoryOrderStore implements OrderStore {
  /** store_account -> (orderId -> pedido). Clonado na entrada e na saída. */
  private readonly byStore = new Map<string, Map<string, CanonicalOrder>>()
  private readonly syncState = new Map<string, Date>()

  private storeMap(storeAccount: string): Map<string, CanonicalOrder> {
    let m = this.byStore.get(storeAccount)
    if (!m) {
      m = new Map<string, CanonicalOrder>()
      this.byStore.set(storeAccount, m)
    }
    return m
  }

  async upsertOrders(storeAccount: string, orders: CanonicalOrder[]): Promise<void> {
    const m = this.storeMap(storeAccount)
    for (const o of orders) {
      const prev = m.get(o.orderId)
      // Sem items novos, preserva o detalhe já sincronizado (espelha o Postgres:
      // cabeçalho atualiza, itens só quando chegam de fato).
      const items = o.items ?? prev?.items
      m.set(o.orderId, clone({ ...o, items }))
    }
  }

  async getOrders(query: OrderQuery): Promise<CanonicalOrder[]> {
    const m = this.byStore.get(query.storeAccount)
    if (!m) return []

    const start = query.range.start.getTime()
    const end = query.range.end.getTime()

    const out: CanonicalOrder[] = []
    for (const o of m.values()) {
      const t = new Date(o.createdAt).getTime()
      if (t < start || t > end) continue
      const copy = clone(o)
      if (!query.withItems) delete copy.items
      out.push(copy)
    }
    // ordena por data pra saída determinística (o Postgres usa ORDER BY)
    out.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    return out
  }

  async getSyncState(storeAccount: string): Promise<Date | null> {
    const d = this.syncState.get(storeAccount)
    return d ? new Date(d.getTime()) : null
  }

  async setSyncState(storeAccount: string, lastSyncedAt: Date): Promise<void> {
    this.syncState.set(storeAccount, new Date(lastSyncedAt.getTime()))
  }
}

/** Cópia rasa segura: isola o que está guardado de mutações externas. */
function clone(o: CanonicalOrder): CanonicalOrder {
  return {
    ...o,
    items: o.items ? o.items.map((i) => ({ ...i })) : undefined,
  }
}
