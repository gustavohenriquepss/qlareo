/**
 * pgClient.ts — o ÚNICO arquivo do projeto que importa `pg`.
 * -----------------------------------------------------------------------------
 * Adapta um `pg.Pool` para a porta `SqlClient & Transactional` de `store/sql.ts`.
 * Todo o resto do código depende da porta, nunca do driver — trocar `pg` por
 * outro cliente Postgres significa reescrever só este arquivo.
 *
 * `transaction(fn)` pega um client dedicado do pool, faz BEGIN, executa `fn`
 * com esse client, e então COMMIT (sucesso) ou ROLLBACK (exceção). O client é
 * SEMPRE liberado no `finally`, mesmo que o rollback também falhe.
 * -----------------------------------------------------------------------------
 */
import { Pool } from 'pg'
import { type SqlClient, type SqlResult, type SqlRow, type Transactional } from '../sql'

/** Envolve um PoolClient da transação como um SqlClient. */
function wrapPoolClient(client: {
  query<R = unknown>(
    text: string,
    params?: ReadonlyArray<unknown>
  ): Promise<{ rows: R[]; rowCount: number | null }>
}): SqlClient {
  return {
    async query<T extends SqlRow = SqlRow>(
      text: string,
      params?: ReadonlyArray<unknown>
    ): Promise<SqlResult<T>> {
      const res = await client.query<T>(text, params)
      return { rows: res.rows, rowCount: res.rowCount ?? 0 }
    },
  }
}

/**
 * Cria um cliente Postgres a partir de uma connection string (DATABASE_URL).
 * Devolve algo que implementa `SqlClient & Transactional`, além de `close()`
 * para encerrar o pool no shutdown.
 */
export function createPgClient(
  connectionString: string
): SqlClient & Transactional & { close(): Promise<void> } {
  const pool = new Pool({ connectionString })

  return {
    async query<T extends SqlRow = SqlRow>(
      text: string,
      params?: ReadonlyArray<unknown>
    ): Promise<SqlResult<T>> {
      const res = await pool.query<T>(text, params ? [...params] : undefined)
      return { rows: res.rows, rowCount: res.rowCount ?? 0 }
    },

    async transaction<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T> {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const result = await fn(wrapPoolClient(client))
        await client.query('COMMIT')
        return result
      } catch (err) {
        try {
          await client.query('ROLLBACK')
        } catch {
          // O erro original é o que interessa; um rollback que também falha
          // (conexão morta, etc.) não deve mascará-lo.
        }
        throw err
      } finally {
        client.release()
      }
    },

    async close(): Promise<void> {
      await pool.end()
    },
  }
}
