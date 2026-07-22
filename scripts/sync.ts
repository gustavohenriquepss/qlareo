/**
 * scripts/sync.ts — CLI de sincronização (npm run sync).
 * -----------------------------------------------------------------------------
 * Puxa os pedidos da VTEX para o store local. É o que mantém os relatórios
 * rápidos e sem os tetos da API. Rode periodicamente (cron) ou sob demanda.
 *
 *   npm run sync -- --from=2026-01-01 --to=2026-01-31           # cabeçalhos
 *   npm run sync -- --from=2026-01-01 --to=2026-01-31 --items   # com detalhe
 * -----------------------------------------------------------------------------
 */
import { loadConfig } from '../server/config'
import { buildVtexAdapter } from '../platform/vtex'
import { createStore } from '../store/factory'
import { syncOrders } from '../store/sync'

interface Args {
  from: string
  to: string
  items: boolean
}

function parseArgs(argv: string[]): Args {
  const get = (name: string): string | undefined => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`))
    return hit ? hit.slice(name.length + 3) : undefined
  }
  const from = get('from')
  const to = get('to')
  if (!from || !to) {
    throw new Error('Uso: npm run sync -- --from=YYYY-MM-DD --to=YYYY-MM-DD [--items]')
  }
  return { from, to, items: argv.includes('--items') }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const config = loadConfig()

  const start = new Date(args.from)
  const end = new Date(args.to)
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) {
    throw new Error(`Intervalo inválido: from=${args.from} to=${args.to}`)
  }

  const adapter = buildVtexAdapter(config.vtex)
  const store = await createStore(config)

  console.log(
    `Sincronizando ${config.vtex.account} de ${args.from} a ${args.to}` +
      (args.items ? ' (com itens)…' : '…')
  )
  const result = await syncOrders(adapter, store, config.vtex.account, { start, end }, {
    enrichItems: args.items,
  })
  console.log(
    `OK: ${result.pedidosSincronizados} pedidos gravados` +
      (result.comItens ? ' com detalhe de item.' : '.')
  )
}

main().catch((err) => {
  console.error(`Falha no sync: ${err instanceof Error ? err.message : err}`)
  process.exitCode = 1
})
