/**
 * factory.ts — escolhe a implementação de store conforme o ambiente.
 * -----------------------------------------------------------------------------
 * Com DATABASE_URL -> Postgres (produção). Sem -> memória (dev/demo/teste).
 *
 * O Postgres é carregado por `import()` dinâmico, então o caminho em memória
 * (e todo o `npm test`) nunca importa o driver `pg` — que nem está instalado
 * fora de produção. Só quem define DATABASE_URL paga essa dependência.
 * -----------------------------------------------------------------------------
 */
import { type OrderStore } from './orderStore'
import { MemoryOrderStore } from './memoryStore'

export interface StoreConfig {
  databaseUrl?: string
}

export async function createStore(config: StoreConfig): Promise<OrderStore> {
  if (!config.databaseUrl) {
    return new MemoryOrderStore()
  }
  // Import dinâmico: mantém `pg` fora do bundle de dev/teste.
  const { createPgClient } = await import('./postgres/pgClient')
  const { PostgresOrderStore } = await import('./postgres/postgresOrderStore')
  const client = createPgClient(config.databaseUrl)
  return new PostgresOrderStore(client)
}
