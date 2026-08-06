/**
 * offboarding.ts — apaga tudo de uma org. É a resposta a "exclua meus dados".
 * -----------------------------------------------------------------------------
 * LGPD desde o dia 1, e não como funcionalidade futura: o pedido de exclusão
 * chega sem aviso e com prazo. Uma rotina escrita depois, com pressa, é a que
 * apaga metade.
 *
 * TUDO NUMA TRANSAÇÃO. Uma org apagada pela metade é pior que uma org não
 * apagada: sobra dado pessoal órfão que ninguém mais alcança pela interface — e
 * portanto ninguém revisa, exporta ou apaga depois. Ou vai inteiro, ou não vai.
 *
 * -----------------------------------------------------------------------------
 * A ORDEM DOS DELETES, E POR QUÊ
 *
 *   0. LÊ  `vtex_accounts` → `account_name`
 *   1. DEL `order_items`      (por store_account)
 *   2. DEL `orders`           (por store_account)
 *   3. DEL `sync_state`       (por store_account)
 *   4. DEL `vtex_accounts`    (por org_id)
 *   5. DEL `memberships`      (por org_id)
 *   6. DEL `organizations`    (por id)
 *
 * O passo 0 é obrigatório e vem primeiro porque as tabelas de dados NÃO são
 * indexadas por `org_id` — elas usam `store_account`, e o único lugar que liga
 * um ao outro é `vtex_accounts`. Apagar `vtex_accounts` antes das tabelas de
 * dados deixaria os pedidos inalcançáveis: dado pessoal órfão, sem nenhuma
 * chave para encontrá-lo. É o erro que a ordem existe para impedir.
 *
 * Filho antes de pai (1 antes de 2, 4/5 antes de 6), mesmo com
 * `ON DELETE CASCADE` disponível: o DELETE explícito varre o índice
 * `(store_account, ...)` de uma vez, enquanto a cascata dispara verificação por
 * linha. Além disso, contar o que foi apagado em cada tabela só é possível se
 * cada DELETE for nosso — e o relatório do que sumiu é metade do valor desta
 * rotina numa resposta a titular.
 *
 * -----------------------------------------------------------------------------
 * QUAL ROLE RODA ISTO
 *
 * O DONO das tabelas, como as migrations — não o role da aplicação. A migration
 * 005 dá a `qlareo_app` apenas SELECT em `organizations`, `memberships` e
 * `vtex_accounts`; um offboarding com o role da app falharia no passo 4. É
 * operação administrativa e o privilégio segue essa fronteira.
 *
 * A declaração de tenant (`set_config`) é emitida mesmo assim. Rodando como
 * dono ela não faz efeito — RLS não se aplica ao dono —, mas mantém a rotina
 * correta se um dia os GRANTs mudarem e ela passar a rodar sob policy.
 * -----------------------------------------------------------------------------
 */
import { type SqlClient, type Transactional } from '../sql'

/** Quantas linhas sumiram em cada tabela. Vira registro da operação. */
export interface OffboardCounts {
  order_items: number
  orders: number
  sync_state: number
  vtex_accounts: number
  memberships: number
  organizations: number
}

export interface OffboardResult {
  orgId: string
  /** `null` quando a org nunca conectou uma loja (onboarding incompleto). */
  storeAccount: string | null
  /** `true` quando a org não existia — a rotina é idempotente. */
  jaEstavaAusente: boolean
  counts: OffboardCounts
}

const TABELAS_VAZIAS: OffboardCounts = {
  order_items: 0,
  orders: 0,
  sync_state: 0,
  vtex_accounts: 0,
  memberships: 0,
  organizations: 0,
}

export interface OffboardOptions {
  /**
   * Conta o que seria apagado e desfaz tudo no fim. Os números são exatos, não
   * estimativa: as linhas chegam a ser apagadas dentro da transação, e a
   * transação é revertida. É o que se manda para o titular antes de executar.
   */
  dryRun?: boolean
}

/** Sentinela do dry-run: força ROLLBACK sem sinalizar erro. */
const DESFAZER = Symbol('dry-run')

/**
 * Apaga a org e tudo que pende dela. Idempotente: rodar de novo numa org já
 * apagada devolve zeros em vez de estourar — importante porque a segunda
 * execução costuma ser alguém conferindo se a primeira funcionou.
 */
export async function offboardOrg(
  db: SqlClient & Transactional,
  orgId: string,
  options: OffboardOptions = {}
): Promise<OffboardResult> {
  let resultado: OffboardResult = {
    orgId,
    storeAccount: null,
    jaEstavaAusente: true,
    counts: { ...TABELAS_VAZIAS },
  }

  try {
    await db.transaction(async (tx) => {
      resultado = await apagar(tx, orgId)
      if (options.dryRun) throw DESFAZER
    })
  } catch (err) {
    if (err !== DESFAZER) throw err
  }

  return resultado
}

async function apagar(tx: SqlClient, orgId: string): Promise<OffboardResult> {
  const counts: OffboardCounts = { ...TABELAS_VAZIAS }

  const org = await tx.query(`SELECT 1 FROM organizations WHERE id = $1`, [orgId])
  if (org.rowCount === 0) {
    return { orgId, storeAccount: null, jaEstavaAusente: true, counts }
  }

  // Passo 0 — a ponte org -> store_account, antes de apagá-la.
  const conta = await tx.query<{ account_name: string }>(
    `SELECT account_name FROM vtex_accounts WHERE org_id = $1`,
    [orgId]
  )
  const storeAccount = conta.rows[0]?.account_name ?? null

  if (storeAccount) {
    await tx.query(`SELECT set_config('qlareo.store_account', $1, true)`, [
      storeAccount,
    ])

    counts.order_items = await del(
      tx,
      `DELETE FROM order_items WHERE store_account = $1`,
      [storeAccount]
    )
    counts.orders = await del(
      tx,
      `DELETE FROM orders WHERE store_account = $1`,
      [storeAccount]
    )
    counts.sync_state = await del(
      tx,
      `DELETE FROM sync_state WHERE store_account = $1`,
      [storeAccount]
    )
  }

  counts.vtex_accounts = await del(
    tx,
    `DELETE FROM vtex_accounts WHERE org_id = $1`,
    [orgId]
  )
  counts.memberships = await del(
    tx,
    `DELETE FROM memberships WHERE org_id = $1`,
    [orgId]
  )
  counts.organizations = await del(
    tx,
    `DELETE FROM organizations WHERE id = $1`,
    [orgId]
  )

  // O USUÁRIO não é apagado aqui, de propósito: ele pode ser membro de outras
  // orgs (agência, multi-marca). Apagar a conta de uma pessoa é outro pedido,
  // com outro titular — e quem some junto com a org é o VÍNCULO, não a pessoa.
  return { orgId, storeAccount, jaEstavaAusente: false, counts }
}

async function del(
  tx: SqlClient,
  sql: string,
  params: unknown[]
): Promise<number> {
  const res = await tx.query(sql, params)
  return res.rowCount
}
