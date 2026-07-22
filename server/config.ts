/**
 * config.ts — configuração por ambiente, validada na subida.
 * -----------------------------------------------------------------------------
 * Credenciais NUNCA no código nem no repositório. Vêm do ambiente (ou de um
 * gerenciador de segredos em produção). O `.env.example` documenta as chaves
 * sem valores. Falha barulhenta e cedo se algo obrigatório faltar — melhor que
 * um 500 opaco na primeira requisição.
 * -----------------------------------------------------------------------------
 */
import { type VtexCredentials } from '../transport/fetchHttpClient'

export interface AppConfig {
  port: number
  vtex: VtexCredentials
  /**
   * Chave que protege o endpoint do PRÓPRIO QLAREO (header `x-api-key`). Sem
   * ela, qualquer um com a URL leria o faturamento da loja. Opcional só para
   * facilitar o desenvolvimento local; em produção, defina.
   */
  apiKey?: string
  /**
   * Conexão Postgres. Presente -> relatórios leem do banco (produção). Ausente
   * -> store em memória (dev/demo; começa vazio, populado pelo sync).
   */
  databaseUrl?: string
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const account = env.VTEX_ACCOUNT
  const appKey = env.VTEX_APP_KEY
  const appToken = env.VTEX_APP_TOKEN

  const missing = [
    ['VTEX_ACCOUNT', account],
    ['VTEX_APP_KEY', appKey],
    ['VTEX_APP_TOKEN', appToken],
  ]
    .filter(([, v]) => !v || !String(v).trim())
    .map(([k]) => k)

  if (missing.length > 0) {
    throw new Error(
      `Configuração ausente: ${missing.join(', ')}. ` +
        `Defina no ambiente (ver .env.example).`
    )
  }

  return {
    port: Number(env.PORT ?? 3000),
    vtex: {
      account: account!,
      appKey: appKey!,
      appToken: appToken!,
      environment: env.VTEX_ENVIRONMENT,
    },
    apiKey: env.QLAREO_API_KEY,
    databaseUrl: env.DATABASE_URL,
  }
}
