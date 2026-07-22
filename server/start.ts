/**
 * start.ts — entrypoint do processo (`npm start`).
 * Separado de main.ts para que importar a app em teste não suba socket nenhum.
 */
import { loadConfig } from './config'
import { createApp } from './main'
import { createStore } from '../store/factory'

async function main(): Promise<void> {
  const config = loadConfig()
  const store = await createStore(config)

  createApp(config, store).listen(config.port, () => {
    const mode = config.databaseUrl ? 'Postgres' : 'memória (dev)'
    console.log(
      `QLAREO ouvindo em http://localhost:${config.port} ` +
        `(conta VTEX: ${config.vtex.account}, store: ${mode})`
    )
  })
}

main().catch((err) => {
  console.error(`Falha ao subir: ${err instanceof Error ? err.message : err}`)
  process.exitCode = 1
})
