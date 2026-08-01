/**
 * postgresTenantDirectory.ts — o diretório de tenancy lido do Postgres.
 * -----------------------------------------------------------------------------
 * Implementa `TenantDirectory` (server/tenant.ts) com uma consulta só, e é a
 * consulta que carrega a garantia de isolamento do produto inteiro:
 *
 *     memberships ⋈ vtex_accounts
 *
 * A conta VTEX é alcançada ATRAVÉS do vínculo. Não existe caminho que leia
 * `vtex_accounts` por `org_id` sem passar por `memberships` — pedir a conta de
 * uma org da qual o usuário não é membro devolve zero linhas, não uma linha com
 * uma flag de permissão que alguém possa esquecer de conferir.
 *
 * Ambos os parâmetros vão parametrizados ($1, $2). O `account_name` que sai daqui
 * é o mesmo valor gravado em `orders.store_account` — a igualdade que dispensou
 * o backfill da refatoração multi-tenant.
 * -----------------------------------------------------------------------------
 */
import { type Session, type TenantDirectory } from '../../server/tenant'
import { type SqlClient } from '../sql'

export function createPostgresTenantDirectory(db: SqlClient): TenantDirectory {
  return {
    async findStoreAccount(session: Session): Promise<string | null> {
      const res = await db.query<{ account_name: string }>(
        `SELECT va.account_name
           FROM memberships m
           JOIN vtex_accounts va ON va.org_id = m.org_id
          WHERE m.user_id = $1
            AND m.org_id  = $2`,
        [session.userId, session.orgId]
      )
      return res.rows[0]?.account_name ?? null
    },

    async hasMembership(session: Session): Promise<boolean> {
      const res = await db.query(
        `SELECT 1 FROM memberships WHERE user_id = $1 AND org_id = $2`,
        [session.userId, session.orgId]
      )
      return res.rowCount > 0
    },
  }
}
