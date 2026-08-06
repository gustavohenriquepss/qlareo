/**
 * scripts/offboard.ts — apaga uma org e tudo dela (npm run offboard).
 * -----------------------------------------------------------------------------
 * A ferramenta de resposta a "exclua meus dados". Destrutiva e irreversível:
 * não há lixeira, não há undo, e o backup é a única volta.
 *
 *   # 1. SEMPRE primeiro: ver o que sumiria, sem apagar nada
 *   npm run offboard -- --org=<uuid> --dry-run
 *
 *   # 2. Executar de verdade
 *   npm run offboard -- --org=<uuid> --confirmo-que-apaga
 *
 * RODE COM O ROLE DONO das tabelas — o mesmo do `npm run migrate`, não o da
 * aplicação. A migration 005 dá só SELECT ao role da app nas tabelas de
 * tenancy, então um offboarding com ele falharia no meio (dentro da transação,
 * então sem estrago — mas também sem apagar).
 * -----------------------------------------------------------------------------
 */
import { createPgClient } from '../store/postgres/pgClient'
import { offboardOrg, type OffboardCounts } from '../store/postgres/offboarding'

const FLAG_CONFIRMACAO = '--confirmo-que-apaga'

function arg(argv: string[], nome: string): string | undefined {
  const hit = argv.find((a) => a.startsWith(`--${nome}=`))
  return hit ? hit.slice(nome.length + 3) : undefined
}

function tabela(counts: OffboardCounts): string {
  const linhas = Object.entries(counts).map(
    ([tabela, n]) => `  ${tabela.padEnd(16)} ${String(n).padStart(9)}`
  )
  const total = Object.values(counts).reduce((s, n) => s + n, 0)
  return [...linhas, `  ${'TOTAL'.padEnd(16)} ${String(total).padStart(9)}`].join('\n')
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const orgId = arg(argv, 'org')
  const dryRun = argv.includes('--dry-run')
  const confirmado = argv.includes(FLAG_CONFIRMACAO)

  if (!orgId) {
    throw new Error(
      `Uso: npm run offboard -- --org=<uuid> [--dry-run | ${FLAG_CONFIRMACAO}]`
    )
  }

  // Sem flag longa e explícita, não apaga. A flag é comprida de propósito: não
  // se digita por reflexo, e não sobra num histórico de shell parecendo inócua.
  if (!dryRun && !confirmado) {
    throw new Error(
      `Operação destrutiva e IRREVERSÍVEL. Rode primeiro com --dry-run para ` +
        `ver o que sumiria; para executar, repita com ${FLAG_CONFIRMACAO}.`
    )
  }

  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL não definido.')

  const db = createPgClient(url)
  try {
    const inicio = Date.now()
    const r = await offboardOrg(db, orgId, { dryRun })
    const ms = Date.now() - inicio

    if (r.jaEstavaAusente) {
      console.log(`Org ${orgId} não existe — nada a apagar.`)
      return
    }

    console.log(dryRun ? '── SIMULAÇÃO (nada foi apagado) ──' : '── APAGADO ──')
    console.log(`org:   ${r.orgId}`)
    console.log(`loja:  ${r.storeAccount ?? '(nenhuma conta conectada)'}`)
    console.log(tabela(r.counts))
    console.log(`tempo: ${ms} ms`)

    if (dryRun) {
      console.log(
        `\nOs números acima são exatos, não estimativa: as linhas foram ` +
          `apagadas dentro da transação e a transação foi revertida.\n` +
          `Para executar: repita com ${FLAG_CONFIRMACAO}`
      )
    } else {
      // O usuário NÃO é apagado: pode ser membro de outras orgs. Some o vínculo.
      console.log(
        `\nRegistre esta saída na resposta ao titular. Usuários não foram ` +
          `apagados — apenas os vínculos com esta org.`
      )
    }
  } finally {
    await db.close()
  }
}

main().catch((err) => {
  console.error(`Falha no offboarding: ${err instanceof Error ? err.message : err}`)
  process.exitCode = 1
})
