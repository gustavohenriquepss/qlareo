/**
 * fetchHttpClient.ts — transporte standalone da Orders API da VTEX.
 * -----------------------------------------------------------------------------
 * Esta é a peça que torna o QLAREO standalone: implementa o seam `HttpClient`
 * do adapter VTEX usando `fetch` nativo do Node e autenticando por
 * appKey/appToken — em vez da sessão do usuário admin, como faz o app VTEX IO.
 *
 * O adapter e o core não sabem que trocou o transporte. Trocar isto por outra
 * forma de auth (ou por outra plataforma) não toca em uma linha de relatório.
 *
 * Segurança: o par appKey/appToken lê os pedidos da loja. É credencial de
 * terceiro — nunca logue o token, e guarde-o cifrado em repouso (ver README,
 * seção de privacidade). Aqui ele só transita nos headers da chamada.
 * -----------------------------------------------------------------------------
 */
import { type HttpClient } from '../adapters/vtex'

export interface VtexCredentials {
  /** Nome da conta VTEX (o subdomínio: `{account}.vtexcommercestable.com.br`). */
  account: string
  appKey: string
  appToken: string
  /** Ambiente. Default estável de produção. */
  environment?: string
}

export interface FetchHttpClientOptions {
  /** Timeout por request, em ms. Default 30s. */
  timeoutMs?: number
  /** Injetável para teste. Default: fetch global do Node. */
  fetchImpl?: typeof fetch
}

export class VtexHttpError extends Error {
  readonly status: number
  readonly path: string

  constructor(status: number, path: string, body: string) {
    super(`VTEX OMS ${status} em ${path}: ${body.slice(0, 200)}`)
    this.name = 'VtexHttpError'
    this.status = status
    this.path = path
  }
}

/** Host padrão de produção estável da VTEX. */
const DEFAULT_HOST = 'vtexcommercestable.com.br'

export class FetchHttpClient implements HttpClient {
  private readonly baseUrl: string
  private readonly headers: Record<string, string>
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch

  constructor(creds: VtexCredentials, options: FetchHttpClientOptions = {}) {
    requireNonEmpty(creds.account, 'account')
    requireNonEmpty(creds.appKey, 'appKey')
    requireNonEmpty(creds.appToken, 'appToken')

    const host = creds.environment ?? DEFAULT_HOST
    this.baseUrl = `https://${creds.account}.${host}`
    this.headers = {
      'X-VTEX-API-AppKey': creds.appKey,
      'X-VTEX-API-AppToken': creds.appToken,
      Accept: 'application/json',
    }
    this.timeoutMs = options.timeoutMs ?? 30000
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  async get<T>(path: string, params: Record<string, string | number>): Promise<T> {
    const url = new URL(path, this.baseUrl)
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value))
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const res = await this.fetchImpl(url.toString(), {
        method: 'GET',
        headers: this.headers,
        signal: controller.signal,
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new VtexHttpError(res.status, path, text)
      }
      return (await res.json()) as T
    } finally {
      clearTimeout(timer)
    }
  }
}

function requireNonEmpty(value: string | undefined, name: string): void {
  if (!value || !value.trim()) {
    throw new Error(`Credencial VTEX ausente: "${name}" é obrigatório.`)
  }
}
