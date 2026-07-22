/**
 * migrate.ts — runner de migrations, agnóstico ao driver.
 * -----------------------------------------------------------------------------
 * Recebe um `SqlClient & Transactional` já pronto (quem injeta é o entrypoint,
 * que importa `pg` via pgClient.ts — aqui NÃO importamos `pg`).
 *
 * Estratégia: uma tabela `schema_migrations` guarda as versões já aplicadas.
 * Lê os arquivos `db/migrations/*.sql` em ordem lexicográfica, e aplica os que
 * ainda faltam — cada um dentro de UMA transação junto do registro da versão,
 * para que uma migration ou é aplicada-e-registrada, ou nenhuma das duas.
 * -----------------------------------------------------------------------------
 */
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

import { type SqlClient, type Transactional } from '../sql'

/**
 * Diretório padrão das migrations: <cwd>/db/migrations.
 * Usamos `process.cwd()` (o entrypoint roda da raiz do repo) em vez de
 * `import.meta.url` — este último NÃO compila com `module=commonjs` no tsconfig.
 */
function defaultMigrationsDir(): string {
  return join(process.cwd(), 'db', 'migrations')
}

async function ensureMigrationsTable(db: SqlClient): Promise<void> {
  await db.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version    TEXT PRIMARY KEY,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`
  )
}

async function appliedVersions(db: SqlClient): Promise<Set<string>> {
  const res = await db.query<{ version: string }>(
    `SELECT version FROM schema_migrations`
  )
  return new Set(res.rows.map((r) => r.version))
}

/**
 * Aplica todas as migrations pendentes de `dir` (default: db/migrations).
 * Retorna a lista de versões efetivamente aplicadas nesta execução.
 */
export async function runMigrations(
  db: SqlClient & Transactional,
  dir: string = defaultMigrationsDir()
): Promise<string[]> {
  await ensureMigrationsTable(db)
  const done = await appliedVersions(db)

  const files = (await readdir(dir))
    .filter((f) => f.endsWith('.sql'))
    .sort() // ordem lexicográfica: 001_, 002_, ...

  const applied: string[] = []
  for (const file of files) {
    const version = file.replace(/\.sql$/, '')
    if (done.has(version)) continue

    const sql = await readFile(join(dir, file), 'utf8')

    // A migration inteira + o registro da versão numa só transação.
    await db.transaction(async (tx) => {
      await tx.query(sql)
      await tx.query(
        `INSERT INTO schema_migrations (version) VALUES ($1)`,
        [version]
      )
    })

    applied.push(version)
  }

  return applied
}
