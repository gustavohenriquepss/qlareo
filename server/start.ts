/**
 * start.ts — entrypoint do processo (`npm start`).
 * Separado de main.ts para que importar a app em teste não suba socket nenhum.
 */
import { loadConfig } from './config'
import { createApp } from './main'

const config = loadConfig()
createApp(config).listen(config.port, () => {
  console.log(
    `QLAREO ouvindo em http://localhost:${config.port} (conta VTEX: ${config.vtex.account})`
  )
})
