/**
 * postgresOrderStore.ts — implementação Postgres da porta OrderStore.
 * -----------------------------------------------------------------------------
 * Depende só de `SqlClient & Transactional` (store/sql.ts); nunca importa `pg`.
 *
 * INVARIANTE SAGRADA — isolamento de tenant: TODA query filtra por
 * `store_account`. Um SELECT/DELETE sem `store_account` no WHERE é o bug que
 * vaza pedido de uma loja para outra. Todos os valores vão PARAMETRIZADOS
 * ($1, $2, ...); nada de interpolar valor em string SQL.
 *
 * Dinheiro é BIGINT no Postgres e chega como STRING no driver; convertemos para
 * number na saída (os valores são inteiros seguros — centavos).
 * -----------------------------------------------------------------------------
 */
import { type CanonicalItem, type CanonicalOrder } from '../../core'
import { type OrderQuery, type OrderStore } from '../orderStore'
import { type SqlClient, type SqlRow, type Transactional } from '../sql'

/** Linha da tabela `orders`, como o driver a devolve. */
interface OrderRow extends SqlRow {
  order_id: string
  created_at: string | Date
  status: string
  raw_status: string
  total_minor: string | number
  currency: string
  payment_method: string | null
  seller_name: string | null
  customer_email: string | null
  shipping_state: string | null
  shipping_city: string | null
  coupon: string | null
  utm_source: string | null
  utm_campaign: string | null
}

/** Linha da tabela `order_items`, como o driver a devolve. */
interface ItemRow extends SqlRow {
  order_id: string
  line_no: string | number
  sku_id: string
  product_id: string
  name: string
  quantity: string | number
  unit_paid_minor: string | number
  unit_list_minor: string | number | null
}

/** BIGINT/INT chegam como string do pg; converte para number (inteiro seguro). */
function toNum(v: string | number): number {
  return typeof v === 'number' ? v : Number(v)
}

/** created_at pode vir como Date (pg) ou string; normaliza para ISO 8601 UTC. */
function toIso(v: string | Date): string {
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString()
}

export class PostgresOrderStore implements OrderStore {
  private readonly db: SqlClient & Transactional

  constructor(db: SqlClient & Transactional) {
    this.db = db
  }

  /**
   * Abre transação, declara a loja para a RLS (005_rls.sql) e roda `fn`.
   *
   * TODA operação passa por aqui, inclusive as de leitura — que antes usavam
   * `this.db.query` solto. O motivo é o `true` do `set_config`: ele prende o
   * ajuste à TRANSAÇÃO. Sem transação, o valor ficaria na conexão e vazaria para
   * a próxima requisição que pegasse a mesma do pool — dois lojistas, uma
   * conexão reciclada, e o segundo lê os dados do primeiro.
   *
   * `set_config` e não `SET LOCAL`: comandos SET não aceitam parâmetro de bind,
   * e montar o SET por concatenação colocaria um valor externo dentro do texto
   * do comando. Aqui o valor vai em $1, como todo o resto deste arquivo.
   *
   * O custo é um BEGIN/COMMIT por leitura. É o preço da rede de segurança — e o
   * filtro explícito `WHERE store_account = $1` continua em toda query, porque
   * a RLS é a segunda tranca, não a primeira.
   */
  private async withTenant<T>(
    storeAccount: string,
    fn: (tx: SqlClient) => Promise<T>
  ): Promise<T> {
    return this.db.transaction(async (tx) => {
      await tx.query(`SELECT set_config('qlareo.store_account', $1, true)`, [
        storeAccount,
      ])
      return fn(tx)
    })
  }

  async upsertOrders(storeAccount: string, orders: CanonicalOrder[]): Promise<void> {
    if (orders.length === 0) return

    await this.withTenant(storeAccount, async (tx) => {
      for (const order of orders) {
        const hasItems = order.items !== undefined

        // UPSERT do cabeçalho. items_synced na inserção = hasItems; no conflito,
        // `orders.items_synced OR EXCLUDED.items_synced` PRESERVA o TRUE já
        // existente e nunca rebaixa para FALSE quando o pedido chega sem itens.
        await tx.query(
          `INSERT INTO orders (
             store_account, order_id, created_at, status, raw_status,
             total_minor, currency, payment_method, seller_name, customer_email,
             shipping_state, shipping_city, coupon, utm_source, utm_campaign,
             items_synced
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
                   $15, $16)
           ON CONFLICT (store_account, order_id) DO UPDATE SET
             created_at     = EXCLUDED.created_at,
             status         = EXCLUDED.status,
             raw_status     = EXCLUDED.raw_status,
             total_minor    = EXCLUDED.total_minor,
             currency       = EXCLUDED.currency,
             payment_method = EXCLUDED.payment_method,
             seller_name    = EXCLUDED.seller_name,
             customer_email = EXCLUDED.customer_email,
             -- COALESCE, e não EXCLUDED direto: os campos de atribuição só
             -- existem no pedido ENRIQUECIDO. Um sync sem --items traz o
             -- cabeçalho com esses campos vazios, e sobrescrever apagaria a UF
             -- e o cupom que um sync anterior já tinha buscado. Mesma lógica do
             -- items_synced logo abaixo: enriquecimento não regride.
             shipping_state = COALESCE(EXCLUDED.shipping_state, orders.shipping_state),
             shipping_city  = COALESCE(EXCLUDED.shipping_city,  orders.shipping_city),
             coupon         = COALESCE(EXCLUDED.coupon,         orders.coupon),
             utm_source     = COALESCE(EXCLUDED.utm_source,     orders.utm_source),
             utm_campaign   = COALESCE(EXCLUDED.utm_campaign,   orders.utm_campaign),
             items_synced   = orders.items_synced OR EXCLUDED.items_synced,
             synced_at      = now()`,
          [
            storeAccount,
            order.orderId,
            order.createdAt,
            order.status,
            order.rawStatus,
            order.totalMinor,
            order.currency,
            order.paymentMethod ?? null,
            order.sellerName ?? null,
            order.customerEmail ?? null,
            order.shippingState ?? null,
            order.shippingCity ?? null,
            order.coupon ?? null,
            order.utmSource ?? null,
            order.utmCampaign ?? null,
            hasItems,
          ]
        )

        // Sem `items`: não toca no detalhe (fica como está — pendente ou já
        // sincronizado). Com `items`: substitui o detalhe por completo.
        if (!hasItems) continue

        await tx.query(
          `DELETE FROM order_items WHERE store_account = $1 AND order_id = $2`,
          [storeAccount, order.orderId]
        )

        const items = order.items ?? []
        for (let lineNo = 0; lineNo < items.length; lineNo++) {
          const item = items[lineNo]
          await tx.query(
            `INSERT INTO order_items (
               store_account, order_id, line_no, sku_id, product_id,
               name, quantity, unit_paid_minor, unit_list_minor
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              storeAccount,
              order.orderId,
              lineNo,
              item.skuId,
              item.productId,
              item.name,
              item.quantity,
              item.unitPaidMinor,
              item.unitListMinor ?? null,
            ]
          )
        }
      }
    })
  }

  async getOrders(query: OrderQuery): Promise<CanonicalOrder[]> {
    const { storeAccount, range, withItems } = query

    return this.withTenant(storeAccount, async (tx) => {
      const res = await tx.query<OrderRow>(
        `SELECT order_id, created_at, status, raw_status, total_minor, currency,
                payment_method, seller_name, customer_email,
                shipping_state, shipping_city, coupon, utm_source, utm_campaign
           FROM orders
          WHERE store_account = $1
            AND created_at >= $2
            AND created_at <= $3
          ORDER BY created_at, order_id`,
        [storeAccount, range.start, range.end]
      )

      const orders: CanonicalOrder[] = res.rows.map((row) => this.mapOrder(row))

      if (!withItems) return orders

      // Segundo SELECT dos itens, filtrado pela MESMA janela via JOIN em orders
      // — continua preso ao tenant ($1) e à faixa de data. Ordenado por
      // order_id, line_no para reconstruir a ordem original do pedido.
      const itemsRes = await tx.query<ItemRow>(
        `SELECT i.order_id, i.line_no, i.sku_id, i.product_id, i.name,
                i.quantity, i.unit_paid_minor, i.unit_list_minor
           FROM order_items i
           JOIN orders o
             ON o.store_account = i.store_account
            AND o.order_id = i.order_id
          WHERE i.store_account = $1
            AND o.created_at >= $2
            AND o.created_at <= $3
          ORDER BY i.order_id, i.line_no`,
        [storeAccount, range.start, range.end]
      )

      const byOrder = new Map<string, CanonicalItem[]>()
      for (const row of itemsRes.rows) {
        const list = byOrder.get(row.order_id) ?? []
        list.push(this.mapItem(row))
        byOrder.set(row.order_id, list)
      }

      for (const order of orders) {
        order.items = byOrder.get(order.orderId) ?? []
      }

      return orders
    })
  }

  async getSyncState(storeAccount: string): Promise<Date | null> {
    return this.withTenant(storeAccount, async (tx) => {
      const res = await tx.query<{ last_synced_at: string | Date | null }>(
        `SELECT last_synced_at FROM sync_state WHERE store_account = $1`,
        [storeAccount]
      )
      const row = res.rows[0]
      if (!row || row.last_synced_at === null) return null
      return row.last_synced_at instanceof Date
        ? row.last_synced_at
        : new Date(row.last_synced_at)
    })
  }

  async setSyncState(storeAccount: string, lastSyncedAt: Date): Promise<void> {
    await this.withTenant(storeAccount, async (tx) => {
      await tx.query(
        `INSERT INTO sync_state (store_account, last_synced_at, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (store_account) DO UPDATE SET
           last_synced_at = EXCLUDED.last_synced_at,
           updated_at     = now()`,
        [storeAccount, lastSyncedAt]
      )
    })
  }

  private mapOrder(row: OrderRow): CanonicalOrder {
    const order: CanonicalOrder = {
      orderId: row.order_id,
      createdAt: toIso(row.created_at),
      status: row.status as CanonicalOrder['status'],
      rawStatus: row.raw_status,
      totalMinor: toNum(row.total_minor),
      currency: row.currency,
    }
    if (row.payment_method !== null) order.paymentMethod = row.payment_method
    if (row.seller_name !== null) order.sellerName = row.seller_name
    if (row.customer_email !== null) order.customerEmail = row.customer_email
    if (row.shipping_state !== null) order.shippingState = row.shipping_state
    if (row.shipping_city !== null) order.shippingCity = row.shipping_city
    if (row.coupon !== null) order.coupon = row.coupon
    if (row.utm_source !== null) order.utmSource = row.utm_source
    if (row.utm_campaign !== null) order.utmCampaign = row.utm_campaign
    return order
  }

  private mapItem(row: ItemRow): CanonicalItem {
    const item: CanonicalItem = {
      skuId: row.sku_id,
      productId: row.product_id,
      name: row.name,
      quantity: toNum(row.quantity),
      unitPaidMinor: toNum(row.unit_paid_minor),
    }
    if (row.unit_list_minor !== null) item.unitListMinor = toNum(row.unit_list_minor)
    return item
  }
}
