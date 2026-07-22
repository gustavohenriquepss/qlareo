/**
 * sync.ts — traz pedidos da plataforma para o store local.
 * -----------------------------------------------------------------------------
 * É a costura que troca "consultar a Orders API a cada relatório" por "consultar
 * o banco local, sincronizado periodicamente". É aqui que o teto de 3.000 por
 * consulta e a janela de ~24 meses deixam de limitar os relatórios: o custo de
 * puxar da API é pago no sync, não a cada leitura.
 *
 * Enriquecimento (itens) é opcional e caro: normalmente roda num passo separado
 * ou só para o período que os relatórios de produto/promoção vão cobrir.
 * -----------------------------------------------------------------------------
 */
import { type DateRange, type PlatformAdapter } from '../core'
import { type OrderStore } from './orderStore'

export interface SyncOptions {
  /** Buscar também o detalhe de item (Get Order por pedido). Caro. */
  enrichItems?: boolean
}

export interface SyncResult {
  storeAccount: string
  pedidosSincronizados: number
  comItens: boolean
  de: string
  ate: string
}

/**
 * Sincroniza um intervalo: puxa do adapter, opcionalmente enriquece, grava no
 * store e avança a marca d'água. Idempotente — rodar de novo no mesmo intervalo
 * faz upsert, não duplica.
 */
export async function syncOrders(
  adapter: PlatformAdapter,
  store: OrderStore,
  storeAccount: string,
  range: DateRange,
  options: SyncOptions = {}
): Promise<SyncResult> {
  const base = await adapter.fetchOrders(range)
  const orders = options.enrichItems ? await adapter.enrichWithItems(base) : base

  await store.upsertOrders(storeAccount, orders)

  // Marca d'água = maior created_at visto (não o "agora"): é o ponto a partir do
  // qual um próximo sync incremental pode retomar.
  const watermark = highWaterMark(orders) ?? range.end
  await store.setSyncState(storeAccount, watermark)

  return {
    storeAccount,
    pedidosSincronizados: orders.length,
    comItens: Boolean(options.enrichItems),
    de: range.start.toISOString(),
    ate: range.end.toISOString(),
  }
}

function highWaterMark(orders: { createdAt: string }[]): Date | null {
  let max: number | null = null
  for (const o of orders) {
    const t = new Date(o.createdAt).getTime()
    if (max === null || t > max) max = t
  }
  return max === null ? null : new Date(max)
}
