/**
 * Testes de offboarding — a rotina de "exclua meus dados".
 * -----------------------------------------------------------------------------
 * Sem banco (este arquivo inteiro roda em `npm test`), o que dá para provar é a
 * ORDEM. E a ordem é justamente onde mora o erro grave: as tabelas de dados são
 * indexadas por `store_account`, não por `org_id`, e o único lugar que liga um
 * ao outro é `vtex_accounts`. Apagar `vtex_accounts` antes dos pedidos deixaria
 * dado pessoal órfão — presente no banco, inalcançável por qualquer chave.
 *
 * Um comentário na função não impede esse refactor. Um teste, sim.
 *
 * A prova de que as linhas somem de verdade (e de que a org vizinha fica
 * intacta) exige Postgres e está em multiTenantSchema.test.ts, gated.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { offboardOrg } from '../../../store/postgres/offboarding'
import { type SqlClient, type SqlResult, type SqlRow, type Transactional } from '../../../store/sql'

const ORG = '11111111-1111-1111-1111-111111111111'
const CONTA = 'loja-que-sai'

interface Recorded {
  text: string
  params: unknown[]
}

class FakeSql implements SqlClient, Transactional {
  readonly calls: Recorded[] = []
  revertida = false
  // Campos explícitos, não parameter properties: `constructor(private readonly
  // x)` estoura ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX sob o type stripping do Node,
  // e o tsc NÃO acusa. É a quarta vez que essa pegadinha aparece no projeto.
  private readonly orgExiste: boolean
  private readonly temConta: boolean

  /** `temConta = false`: existe org, nunca houve loja (onboarding incompleto). */
  constructor(orgExiste = true, temConta = true) {
    this.orgExiste = orgExiste
    this.temConta = temConta
  }

  async query<T extends SqlRow = SqlRow>(
    text: string,
    params?: ReadonlyArray<unknown>
  ): Promise<SqlResult<T>> {
    this.calls.push({ text, params: params ? [...params] : [] })

    if (/FROM organizations WHERE id/.test(text)) {
      return { rows: (this.orgExiste ? [{}] : []) as T[], rowCount: this.orgExiste ? 1 : 0 }
    }
    if (/SELECT account_name FROM vtex_accounts/.test(text)) {
      const rows = this.temConta ? [{ account_name: CONTA } as unknown as T] : []
      return { rows, rowCount: rows.length }
    }
    if (/^\s*DELETE/.test(text)) {
      return { rows: [], rowCount: 7 } // número reconhecível
    }
    return { rows: [], rowCount: 0 }
  }

  async transaction<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T> {
    try {
      return await fn(this)
    } catch (err) {
      this.revertida = true
      throw err
    }
  }

  /** Índice da primeira query que casa, ou -1. */
  indice(re: RegExp): number {
    return this.calls.findIndex((c) => re.test(c.text))
  }

  get deletes(): string[] {
    return this.calls
      .filter((c) => /^\s*DELETE/.test(c.text))
      .map((c) => /DELETE FROM (\w+)/.exec(c.text)![1]!)
  }
}

describe('offboarding — ordem dos deletes', () => {
  test('lê a conta VTEX ANTES de apagar qualquer coisa', async () => {
    const sql = new FakeSql()
    await offboardOrg(sql, ORG)

    const leitura = sql.indice(/SELECT account_name FROM vtex_accounts/)
    const primeiroDelete = sql.indice(/^\s*DELETE/)

    assert.ok(leitura >= 0, 'não leu a conta VTEX')
    assert.ok(
      leitura < primeiroDelete,
      'a ponte org -> store_account tem que ser lida antes de qualquer DELETE'
    )
  })

  test('apaga vtex_accounts DEPOIS das tabelas de dados', async () => {
    const sql = new FakeSql()
    await offboardOrg(sql, ORG)

    const d = sql.deletes
    assert.ok(
      d.indexOf('orders') < d.indexOf('vtex_accounts'),
      'apagar vtex_accounts antes dos pedidos deixa dado pessoal órfão: as ' +
        'tabelas de dados só são alcançáveis por store_account, e é essa linha ' +
        'que guarda o valor'
    )
    assert.ok(d.indexOf('order_items') < d.indexOf('vtex_accounts'))
    assert.ok(d.indexOf('sync_state') < d.indexOf('vtex_accounts'))
  })

  test('a ordem completa é filho antes de pai', async () => {
    const sql = new FakeSql()
    await offboardOrg(sql, ORG)

    assert.deepEqual(sql.deletes, [
      'order_items',
      'orders',
      'sync_state',
      'vtex_accounts',
      'memberships',
      'organizations',
    ])
  })

  test('declara o tenant antes de tocar nas tabelas de dados', async () => {
    const sql = new FakeSql()
    await offboardOrg(sql, ORG)

    const decl = sql.indice(/set_config\('qlareo\.store_account'/)
    assert.ok(decl >= 0, 'sem declaração, a rotina quebraria sob RLS')
    assert.deepEqual(sql.calls[decl]!.params, [CONTA])
    assert.ok(decl < sql.indice(/DELETE FROM order_items/))
  })

  test('não apaga o usuário — ele pode ser membro de outras orgs', async () => {
    const sql = new FakeSql()
    await offboardOrg(sql, ORG)
    assert.ok(
      !sql.deletes.includes('users'),
      'some o vínculo, não a pessoa; apagar a conta de alguém é outro pedido'
    )
  })
})

describe('offboarding — casos de borda', () => {
  test('org inexistente devolve zeros e não apaga nada', async () => {
    const sql = new FakeSql(false)
    const r = await offboardOrg(sql, ORG)

    assert.equal(r.jaEstavaAusente, true)
    assert.deepEqual(sql.deletes, [], 'nenhum DELETE numa org que não existe')
    assert.equal(Object.values(r.counts).reduce((s, n) => s + n, 0), 0)
  })

  test('rodar de novo é seguro — a segunda vez é alguém conferindo', async () => {
    const sql = new FakeSql(false)
    await assert.doesNotReject(() => offboardOrg(sql, ORG))
  })

  test('org sem conta conectada apaga tenancy e pula as tabelas de dados', async () => {
    // Onboarding incompleto: existe org e membros, nunca houve loja.
    const sql = new FakeSql(true, false)
    const r = await offboardOrg(sql, ORG)

    assert.equal(r.storeAccount, null)
    assert.deepEqual(sql.deletes, ['vtex_accounts', 'memberships', 'organizations'])
    assert.equal(r.counts.orders, 0)
    assert.equal(
      sql.indice(/set_config/),
      -1,
      'sem loja não há tenant a declarar'
    )
  })
})

describe('offboarding — dry-run', () => {
  test('conta tudo e reverte a transação', async () => {
    const sql = new FakeSql()
    const r = await offboardOrg(sql, ORG, { dryRun: true })

    assert.equal(sql.revertida, true, 'dry-run tem que reverter')
    assert.deepEqual(sql.deletes.length, 6, 'os DELETEs rodam — é o que torna a contagem exata')
    assert.equal(r.counts.orders, 7, 'e os números voltam para quem pediu')
  })

  test('sem dry-run, a transação não é revertida', async () => {
    const sql = new FakeSql()
    await offboardOrg(sql, ORG)
    assert.equal(sql.revertida, false)
  })
})
