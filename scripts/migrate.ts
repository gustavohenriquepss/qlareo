/**
 * scripts/migrate.ts — aplica as migrations no Postgres (npm run migrate).
 * -----------------------------------------------------------------------------
 * Único lugar (com pgClient) que importa `pg`. Precisa de DATABASE_URL.
 *
 *   docker compose up -d
 *   DATABASE_URL=postgres://qlareo:qlareo@localhost:5432/qlareo npm run migrate
 * -----------------------------------------------------------------------------
 */
import { createPgClient } from '../store/postgres/pgClient'
import { runMigrations } from '../store/postgres/migrate'

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error('DATABASE_URL não definido. Ex.: postgres://qlareo:qlareo@localhost:5432/qlareo')
  }

  const db = createPgClient(url)
  try {
    const applied = await runMigrations(db)
    if (applied.length === 0) {
      console.log('Nada a aplicar: banco já está na última migration.')
    } else {
      console.log(`Aplicadas: ${applied.join(', ')}`)
    }
  } finally {
    await db.close()
  }
}

main().catch((err) => {
  console.error(`Falha na migration: ${err instanceof Error ? err.message : err}`)
  process.exitCode = 1
})
