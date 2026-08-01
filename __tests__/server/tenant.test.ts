/**
 * Testes da camada de tenancy — de onde vem o `storeAccount`.
 * -----------------------------------------------------------------------------
 * Três coisas, em ordem de importância:
 *
 *   1. ISOLAMENTO: uma sessão da org A não consegue ler nenhuma linha da org B,
 *      atravessando o servidor HTTP de verdade. É o teste que justifica a issue.
 *   2. RESOLUÇÃO: `resolveTenant` recusa sessão sem vínculo, e o erro distingue
 *      "não é membro" de "org sem conta VTEX".
 *   3. GUARDAS estruturais: invariantes que um refactor futuro pode desfazer sem
 *      quebrar nada visível — `storeAccount` obrigatório na porta, e SQL com
 *      `store_account` num arquivo só. Estes leem código-fonte, não comportamento.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { type AddressInfo } from 'node:net'

import { type CanonicalOrder } from '../../core'
import { type AppConfig } from '../../server/config'
import { createApp } from '../../server/main'
import {
  type Session,
  type TenantDirectory,
  TenantResolutionError,
  resolveTenant,
} from '../../server/tenant'
import { singleTenantDirectory } from '../../server/preAuthTenant'
import { MemoryOrderStore } from '../../store/memoryStore'

const LOJA_A = 'loja-alfa'
const LOJA_B = 'loja-beta'

const SESSAO_A: Session = { userId: 'u-ana', orgId: 'org-a' }
const SESSAO_B: Session = { userId: 'u-bruno', orgId: 'org-b' }

function pedido(orderId: string, totalMinor: number): CanonicalOrder {
  return {
    orderId,
    createdAt: '2026-01-15T12:00:00Z',
    status: 'paid',
    rawStatus: 'invoiced',
    totalMinor,
    currency: 'BRL',
  }
}

/** Diretório de mentira com duas orgs — o que o Postgres fará na 1.4. */
function diretorioDeDuasOrgs(): TenantDirectory {
  const contas: Record<string, string> = {
    'u-ana|org-a': LOJA_A,
    'u-bruno|org-b': LOJA_B,
  }
  const chave = (s: Session) => `${s.userId}|${s.orgId}`
  return {
    async findStoreAccount(s) {
      return contas[chave(s)] ?? null
    },
    async hasMembership(s) {
      return chave(s) in contas
    },
  }
}

// -----------------------------------------------------------------------------
// 1. Isolamento, ponta a ponta
// -----------------------------------------------------------------------------

describe('isolamento entre orgs', () => {
  const config: AppConfig = {
    port: 0,
    // Repare no valor: `config.vtex.account` aponta para a LOJA B. Se qualquer
    // caminho ainda usasse a config em vez da sessão, a org A leria a B — que é
    // exatamente o vazamento que esta issue fecha.
    vtex: { account: LOJA_B, appKey: 'k', appToken: 't' },
    apiKey: 'segredo',
  }

  async function comServidor(
    sessao: Session,
    fn: (base: string) => Promise<void>
  ): Promise<void> {
    const store = new MemoryOrderStore()
    await store.upsertOrders(LOJA_A, [pedido('a1', 10_000)])
    await store.upsertOrders(LOJA_B, [pedido('b1', 250_000), pedido('b2', 750_000)])

    const directory = diretorioDeDuasOrgs()
    const server = createApp(config, store, () => resolveTenant(directory, sessao))
    await new Promise<void>((r) => server.listen(0, r))
    const { port } = server.address() as AddressInfo
    try {
      await fn(`http://localhost:${port}`)
    } finally {
      await new Promise<void>((r) => server.close(() => r()))
    }
  }

  const AUTH = { headers: { 'x-api-key': 'segredo' } }
  const PERIODO = 'from=2026-01-01&to=2026-01-31&scope=liquido&grain=day'

  /** Totais do relatório, já em unidade maior (o core converte na saída). */
  interface Totais {
    totalFaturamento: number
    totalPedidos: number
  }

  async function totais(base: string): Promise<Totais> {
    const res = await fetch(`${base}/api/reports/sales-by-period?${PERIODO}`, AUTH)
    assert.equal(res.status, 200)
    return (await res.json()) as Totais
  }

  test('a sessão da org A vê só o próprio pedido', async () => {
    await comServidor(SESSAO_A, async (base) => {
      const t = await totais(base)
      // A tem 1 pedido de R$ 100; B tem 2 somando R$ 10.000. Qualquer
      // vazamento move os dois números, não só um.
      assert.equal(t.totalPedidos, 1, 'contagem inclui pedido de outra org')
      assert.equal(t.totalFaturamento, 100, 'faturamento inclui receita de outra org')
    })
  })

  test('a mesma rota com a sessão da org B devolve os dados da B', async () => {
    await comServidor(SESSAO_B, async (base) => {
      const t = await totais(base)
      assert.equal(t.totalPedidos, 2)
      assert.equal(t.totalFaturamento, 10_000)
    })
  })

  test('sessão sem vínculo recebe 403, não 500 nem dados', async () => {
    const intrusa: Session = { userId: 'u-ana', orgId: 'org-b' } // membro de A, pedindo B
    await comServidor(intrusa, async (base) => {
      const res = await fetch(
        `${base}/api/reports/sales-by-period?${PERIODO}`,
        AUTH
      )
      assert.equal(res.status, 403)

      const corpo = JSON.stringify(await res.json())
      assert.ok(!corpo.includes('750000'), 'resposta de erro não pode trazer dado')
      assert.ok(!corpo.includes('7500'), 'resposta de erro não pode trazer dado')
      assert.ok(
        !corpo.includes(LOJA_B),
        'a mensagem não deve revelar o nome da conta VTEX pedida'
      )
    })
  })
})

// -----------------------------------------------------------------------------
// 2. resolveTenant
// -----------------------------------------------------------------------------

describe('resolveTenant', () => {
  test('devolve orgId e storeAccount quando há vínculo', async () => {
    const t = await resolveTenant(diretorioDeDuasOrgs(), SESSAO_A)
    assert.deepEqual(t, { orgId: 'org-a', storeAccount: LOJA_A })
  })

  test('sem vínculo, lança — nunca devolve storeAccount indefinido', async () => {
    await assert.rejects(
      () => resolveTenant(diretorioDeDuasOrgs(), { userId: 'u-ana', orgId: 'org-b' }),
      (err: unknown) => {
        assert.ok(err instanceof TenantResolutionError)
        assert.equal(err.code, 'sem-vinculo')
        return true
      }
    )
  })

  test('org sem conta VTEX é erro DIFERENTE de org sem vínculo', async () => {
    // A distinção existe para a tela de onboarding: "conecte sua loja" e "você
    // não faz parte desta organização" são situações sem nada em comum.
    const semConta: TenantDirectory = {
      async findStoreAccount() {
        return null
      },
      async hasMembership() {
        return true
      },
    }
    await assert.rejects(
      () => resolveTenant(semConta, SESSAO_A),
      (err: unknown) => {
        assert.ok(err instanceof TenantResolutionError)
        assert.equal(err.code, 'sem-conta')
        return true
      }
    )
  })

  test('a ponte pré-auth recusa conta vazia na construção', () => {
    // Conta vazia viraria `store_account = ''`, que não casa com nada e devolve
    // relatório vazio com cara de "não vendeu nada".
    assert.throws(() => singleTenantDirectory('   '), /VTEX_ACCOUNT/)
  })
})

// -----------------------------------------------------------------------------
// 3. Guardas estruturais — leem código, não comportamento
// -----------------------------------------------------------------------------

const RAIZ = process.cwd()

/** Todos os .ts de produção (exclui testes, web/ e node_modules). */
async function fontesDeProducao(): Promise<string[]> {
  const dirs = ['core', 'server', 'store', 'adapters', 'platform', 'transport', 'scripts']
  const out: string[] = []

  async function anda(dir: string): Promise<void> {
    let entradas
    try {
      entradas = await readdir(join(RAIZ, dir), { withFileTypes: true })
    } catch {
      return // diretório opcional
    }
    for (const e of entradas) {
      const rel = `${dir}/${e.name}`
      if (e.isDirectory()) await anda(rel)
      else if (e.name.endsWith('.ts')) out.push(rel)
    }
  }

  for (const d of dirs) await anda(d)
  return out
}

describe('guardas da camada de acesso', () => {
  test('`store_account` em SQL vive só em postgresOrderStore.ts', async () => {
    const permitido = 'store/postgres/postgresOrderStore.ts'
    const infratores: string[] = []

    for (const arquivo of await fontesDeProducao()) {
      if (arquivo === permitido) continue
      const src = await readFile(join(RAIZ, arquivo), 'utf8')
      // Só a forma SQL (snake_case). `storeAccount` em camelCase é o parâmetro
      // que atravessa a aplicação e pode aparecer em qualquer lugar.
      if (/\bstore_account\b/.test(src.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, ''))) {
        infratores.push(arquivo)
      }
    }

    assert.deepEqual(
      infratores,
      [],
      'SQL com store_account fora do repositório: cada lugar novo é um lugar ' +
        'a mais onde o filtro pode ser esquecido'
    )
  })

  test('nenhum método da porta OrderStore torna storeAccount opcional', async () => {
    const src = await readFile(join(RAIZ, 'store/orderStore.ts'), 'utf8')
    assert.ok(
      !/storeAccount\s*\?\s*:/.test(src),
      'storeAccount opcional deixaria "sem filtro" ser uma chamada válida'
    )
    assert.ok(
      !/storeAccount\s*:\s*string\s*=/.test(src),
      'um default para storeAccount é a mesma falha com outra sintaxe'
    )
  })

  test('só existe uma ponte pré-autenticação', async () => {
    const pontes = (await fontesDeProducao()).filter((f) =>
      /preAuth/i.test(f)
    )
    assert.deepEqual(
      pontes,
      ['server/preAuthTenant.ts'],
      'a ponte é temporária (morre na GUS-66) e precisa ser fácil de achar; ' +
        'uma segunda seria o caminho que sobrevive por engano'
    )
  })
})
