/**
 * Testes do schema multi-tenant (003_multi_tenant.sql, 004_vtex_accounts.sql).
 * -----------------------------------------------------------------------------
 * Divididos em dois blocos, com honestidade sobre o que cada um prova:
 *
 *   1. "ordem das migrations" — roda SEMPRE, sem banco. Não prova nada sobre o
 *      SQL; prova que os arquivos têm versões únicas e ordenáveis. Existe porque
 *      esse foi um erro real: a 1.1 foi escrita para criar `002_multi_tenant`
 *      quando `002_order_attribution` já existia na main. O runner aplica em
 *      ordem lexicográfica e registra a versão pelo NOME do arquivo, então dois
 *      `002_` não colidiriam em `schema_migrations` — as duas seriam aplicadas,
 *      em ordem alfabética do sufixo, que é uma ordem sem significado nenhum.
 *
 *   2. "schema multi-tenant" — exige Postgres REAL e só roda com
 *      TEST_DATABASE_URL definida:
 *
 *          docker compose up -d
 *          TEST_DATABASE_URL=postgres://qlareo:qlareo@localhost:5432/qlareo npm test
 *
 *      CASCADE, CHECK e UNIQUE são comportamento do banco: um fake de SqlClient
 *      só provaria que o texto que escrevemos é o texto que enviamos. Sem a
 *      variável, estes testes são PULADOS e aparecem como skipped — não como
 *      verdes. Um verde aqui sem banco seria mentira.
 *
 * Dados 100% sintéticos. Cada teste roda dentro de uma transação revertida ao
 * final, então a base fica como estava.
 */
import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

import { type SqlClient, type Transactional } from '../../../store/sql'

const MIGRATIONS_DIR = join(process.cwd(), 'db', 'migrations')

// -----------------------------------------------------------------------------
// 1. Ordem das migrations — sem banco.
// -----------------------------------------------------------------------------

describe('ordem das migrations', () => {
  test('todo arquivo tem prefixo numérico e nenhum se repete', async () => {
    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql'))
    assert.ok(files.length > 0, 'nenhuma migration encontrada')

    const prefixes = files.map((f) => {
      const m = /^(\d+)_/.exec(f)
      assert.ok(m, `migration sem prefixo numérico: ${f}`)
      return m[1]!
    })

    const repetidos = prefixes.filter((p, i) => prefixes.indexOf(p) !== i)
    assert.deepEqual(
      repetidos,
      [],
      `prefixo repetido em db/migrations: ${repetidos.join(', ')} — ` +
        'a ordem entre duas migrations de mesmo número seria alfabética pelo ' +
        'sufixo, que não tem relação com a ordem em que precisam ser aplicadas'
    )
  })

  test('a ordem lexicográfica do runner é a ordem numérica', async () => {
    const files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith('.sql'))
      .sort() // exatamente o que runMigrations faz

    const numeros = files.map((f) => Number(/^(\d+)_/.exec(f)![1]))
    const crescente = [...numeros].sort((a, b) => a - b)
    assert.deepEqual(
      numeros,
      crescente,
      'zero-padding inconsistente faria o runner aplicar fora de ordem ' +
        '(ex.: "10_" antes de "2_")'
    )
  })

  test('o multi-tenant é o 003, depois do 002 de atribuição', async () => {
    const files = await readdir(MIGRATIONS_DIR)
    assert.ok(
      files.includes('003_multi_tenant.sql'),
      'esperado db/migrations/003_multi_tenant.sql'
    )
  })
})

// -----------------------------------------------------------------------------
// 2. Schema multi-tenant — exige Postgres real.
// -----------------------------------------------------------------------------

const TEST_DB = process.env.TEST_DATABASE_URL
const semBanco = TEST_DB
  ? false
  : 'defina TEST_DATABASE_URL para rodar (docker compose up -d)'

/** Sentinela: força o ROLLBACK sem sinalizar falha de teste. */
const ROLLBACK = Symbol('rollback')

describe('schema multi-tenant', { skip: semBanco }, () => {
  let db: SqlClient & Transactional & { close(): Promise<void> }

  before(async () => {
    // import() dinâmico: mantém `pg` fora do caminho dos testes que rodam sem
    // banco, do mesmo jeito que store/factory.ts faz em produção.
    const { createPgClient } = await import('../../../store/postgres/pgClient')
    const { runMigrations } = await import('../../../store/postgres/migrate')
    db = createPgClient(TEST_DB!)
    await runMigrations(db, MIGRATIONS_DIR)
  })

  after(async () => {
    await db?.close()
  })

  /** Roda `fn` numa transação SEMPRE revertida — a base não guarda resíduo. */
  async function emTransacaoRevertida(
    fn: (tx: SqlClient) => Promise<void>
  ): Promise<void> {
    try {
      await db.transaction(async (tx) => {
        await fn(tx)
        throw ROLLBACK
      })
    } catch (err) {
      if (err !== ROLLBACK) throw err
    }
  }

  async function criarOrg(tx: SqlClient, name: string): Promise<string> {
    const res = await tx.query<{ id: string }>(
      `INSERT INTO organizations (name) VALUES ($1) RETURNING id`,
      [name]
    )
    return res.rows[0]!.id
  }

  async function criarUser(tx: SqlClient, clerkId: string): Promise<string> {
    const res = await tx.query<{ id: string }>(
      `INSERT INTO users (clerk_user_id) VALUES ($1) RETURNING id`,
      [clerkId]
    )
    return res.rows[0]!.id
  }

  async function vincular(
    tx: SqlClient,
    userId: string,
    orgId: string,
    role = 'owner'
  ): Promise<void> {
    await tx.query(
      `INSERT INTO memberships (user_id, org_id, role) VALUES ($1, $2, $3)`,
      [userId, orgId, role]
    )
  }

  async function contar(tx: SqlClient, sql: string, params: unknown[] = []) {
    const res = await tx.query<{ n: string }>(sql, params)
    return Number(res.rows[0]!.n)
  }

  test('cria org, usuário e o vínculo entre os dois', async () => {
    await emTransacaoRevertida(async (tx) => {
      const orgId = await criarOrg(tx, 'Loja Alfa')
      const userId = await criarUser(tx, 'user_alfa_1')
      await vincular(tx, userId, orgId, 'owner')

      const res = await tx.query<{ role: string; name: string }>(
        `SELECT m.role, o.name
           FROM memberships m
           JOIN organizations o ON o.id = m.org_id
          WHERE m.user_id = $1`,
        [userId]
      )
      assert.equal(res.rows.length, 1)
      assert.equal(res.rows[0]!.role, 'owner')
      assert.equal(res.rows[0]!.name, 'Loja Alfa')
    })
  })

  test('um usuário pode pertencer a N orgs — é o caso da agência', async () => {
    await emTransacaoRevertida(async (tx) => {
      const userId = await criarUser(tx, 'user_agencia')
      const orgA = await criarOrg(tx, 'Cliente A')
      const orgB = await criarOrg(tx, 'Cliente B')

      await vincular(tx, userId, orgA, 'admin')
      await vincular(tx, userId, orgB, 'viewer')

      const n = await contar(
        tx,
        `SELECT count(*) AS n FROM memberships WHERE user_id = $1`,
        [userId]
      )
      assert.equal(n, 2, 'nenhuma constraint pode impedir o segundo vínculo')
    })
  })

  test('o par (usuário, org) não se repete', async () => {
    await emTransacaoRevertida(async (tx) => {
      const userId = await criarUser(tx, 'user_dup')
      const orgId = await criarOrg(tx, 'Loja Dup')
      await vincular(tx, userId, orgId, 'owner')

      await assert.rejects(
        () => vincular(tx, userId, orgId, 'viewer'),
        /duplicate key|unique/i
      )
    })
  })

  test('deletar o usuário leva os vínculos junto e preserva a org', async () => {
    await emTransacaoRevertida(async (tx) => {
      const userId = await criarUser(tx, 'user_offboarding')
      const orgId = await criarOrg(tx, 'Loja Que Fica')
      await vincular(tx, userId, orgId, 'admin')

      await tx.query(`DELETE FROM users WHERE id = $1`, [userId])

      const vinculos = await contar(
        tx,
        `SELECT count(*) AS n FROM memberships WHERE user_id = $1`,
        [userId]
      )
      assert.equal(vinculos, 0, 'ON DELETE CASCADE não levou os memberships')

      const orgs = await contar(
        tx,
        `SELECT count(*) AS n FROM organizations WHERE id = $1`,
        [orgId]
      )
      assert.equal(orgs, 1, 'a org não pode sumir junto com um membro')
    })
  })

  test('deletar a org leva os vínculos junto e preserva o usuário', async () => {
    await emTransacaoRevertida(async (tx) => {
      const userId = await criarUser(tx, 'user_sobrevive')
      const orgId = await criarOrg(tx, 'Loja Encerrada')
      await vincular(tx, userId, orgId, 'owner')

      await tx.query(`DELETE FROM organizations WHERE id = $1`, [orgId])

      const vinculos = await contar(
        tx,
        `SELECT count(*) AS n FROM memberships WHERE org_id = $1`,
        [orgId]
      )
      assert.equal(vinculos, 0)

      const users = await contar(
        tx,
        `SELECT count(*) AS n FROM users WHERE id = $1`,
        [userId]
      )
      assert.equal(users, 1, 'o usuário existe fora da org — pode ter outras')
    })
  })

  test('papel fora da lista é rejeitado', async () => {
    await emTransacaoRevertida(async (tx) => {
      const userId = await criarUser(tx, 'user_papel')
      const orgId = await criarOrg(tx, 'Loja Papel')

      await assert.rejects(
        () => vincular(tx, userId, orgId, 'superadmin'),
        /check constraint/i
      )
    })
  })

  test('o mesmo clerk_user_id não entra duas vezes', async () => {
    await emTransacaoRevertida(async (tx) => {
      await criarUser(tx, 'user_repetido')
      await assert.rejects(
        () => criarUser(tx, 'user_repetido'),
        /duplicate key|unique/i
      )
    })
  })

  // ---------------------------------------------------------------------------
  // 004_vtex_accounts.sql
  // ---------------------------------------------------------------------------

  describe('vtex_accounts', () => {
    async function criarConta(
      tx: SqlClient,
      orgId: string,
      accountName: string
    ): Promise<string> {
      const res = await tx.query<{ id: string }>(
        `INSERT INTO vtex_accounts (org_id, account_name) VALUES ($1, $2)
         RETURNING id`,
        [orgId, accountName]
      )
      return res.rows[0]!.id
    }

    test('uma org tem no máximo uma conta VTEX', async () => {
      await emTransacaoRevertida(async (tx) => {
        const orgId = await criarOrg(tx, 'Loja 1a1')
        await criarConta(tx, orgId, 'lojaum')

        await assert.rejects(
          () => criarConta(tx, orgId, 'lojadois'),
          /duplicate key|unique/i,
          'UNIQUE (org_id) é o que materializa o 1:1'
        )
      })
    })

    test('duas orgs não podem apontar para a mesma conta VTEX', async () => {
      await emTransacaoRevertida(async (tx) => {
        const orgA = await criarOrg(tx, 'Org A')
        const orgB = await criarOrg(tx, 'Org B')
        await criarConta(tx, orgA, 'lojacompartilhada')

        await assert.rejects(
          () => criarConta(tx, orgB, 'lojacompartilhada'),
          /duplicate key|unique/i,
          'sem UNIQUE global, as duas orgs leriam os mesmos pedidos e o RLS ' +
            'não pegaria — ambas estariam autorizadas ao mesmo store_account'
        )
      })
    })

    test('apagar a org apaga a conta', async () => {
      await emTransacaoRevertida(async (tx) => {
        const orgId = await criarOrg(tx, 'Loja Encerrada')
        await criarConta(tx, orgId, 'lojaencerrada')

        await tx.query(`DELETE FROM organizations WHERE id = $1`, [orgId])

        const n = await contar(
          tx,
          `SELECT count(*) AS n FROM vtex_accounts WHERE org_id = $1`,
          [orgId]
        )
        assert.equal(n, 0)
      })
    })

    test('a credencial nasce inteiramente NULL', async () => {
      await emTransacaoRevertida(async (tx) => {
        const orgId = await criarOrg(tx, 'Loja Nova')
        await criarConta(tx, orgId, 'lojanova')

        const res = await tx.query<Record<string, unknown>>(
          `SELECT app_key_ciphertext, app_token_ciphertext, dek_wrapped,
                  kek_alias, key_version
             FROM vtex_accounts WHERE org_id = $1`,
          [orgId]
        )
        for (const [col, valor] of Object.entries(res.rows[0]!)) {
          assert.equal(valor, null, `${col} deveria nascer NULL (Fase 4 preenche)`)
        }
      })
    })

    test('credencial pela metade é rejeitada — cofre sem a chave do cofre', async () => {
      await emTransacaoRevertida(async (tx) => {
        const orgId = await criarOrg(tx, 'Loja Meia')
        const contaId = await criarConta(tx, orgId, 'lojameia')

        await assert.rejects(
          () =>
            tx.query(
              `UPDATE vtex_accounts
                  SET app_key_ciphertext = $1, app_token_ciphertext = $1
                WHERE id = $2`,
              [Buffer.from('cifrado'), contaId]
            ),
          /check constraint/i,
          'ciphertext sem dek_wrapped é credencial perdida em silêncio'
        )
      })
    })

    test('credencial completa é aceita', async () => {
      await emTransacaoRevertida(async (tx) => {
        const orgId = await criarOrg(tx, 'Loja Cheia')
        const contaId = await criarConta(tx, orgId, 'lojacheia')

        const res = await tx.query(
          `UPDATE vtex_accounts
              SET app_key_ciphertext = $1, app_token_ciphertext = $1,
                  dek_wrapped = $1, kek_alias = $2, key_version = 1
            WHERE id = $3`,
          [Buffer.from('cifrado'), 'alias/qlareo-prod', contaId]
        )
        assert.equal(res.rowCount, 1)
      })
    })

    test('pedido sem vtex_accounts correspondente é ACEITO (não há FK)', async () => {
      await emTransacaoRevertida(async (tx) => {
        // Fixa a decisão registrada em 004_vtex_accounts.sql. Se alguém
        // adicionar a FK orders.store_account -> vtex_accounts.account_name,
        // este teste quebra e o comentário da migration explica a escolha.
        await tx.query(
          `INSERT INTO orders (store_account, order_id, created_at, status,
                               raw_status, total_minor, currency)
           VALUES ($1, $2, now(), 'paid', 'invoiced', 1000, 'BRL')`,
          ['conta-sem-org', 'ORD-ORFAO-1']
        )

        const n = await contar(
          tx,
          `SELECT count(*) AS n FROM orders WHERE store_account = $1`,
          ['conta-sem-org']
        )
        assert.equal(n, 1, 'o sync e o seed gravam antes de existir org')
      })
    })
  })
})
