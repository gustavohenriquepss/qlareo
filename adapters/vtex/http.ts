/**
 * HttpClient — o seam de transporte do adapter VTEX.
 * -----------------------------------------------------------------------------
 * O adapter NÃO sabe como a request é autenticada nem por qual biblioteca ela
 * sai. Ele só sabe pedir `GET <path>?<params>` e receber JSON. Toda a decisão
 * de credencial, retry, timeout e telemetria fica de fora desta interface.
 *
 * É isso que faz o MESMO adapter servir dois contextos bem diferentes:
 *
 *  1. App VTEX IO (builder node): a implementação envolve um `JanusClient` de
 *     `@vtex/api`, que já viaja com a sessão do admin logado (VtexIdclientAutCookie
 *     + authToken do ctx). Nenhuma credencial é gerenciada pelo app.
 *
 *  2. Serviço standalone (script, backend próprio, teste de carga): a
 *     implementação é um `axios` apontando para
 *     `https://{account}.vtexcommercestable.com.br` com os headers
 *     `X-VTEX-API-AppKey` / `X-VTEX-API-AppToken`. A chave precisa do role
 *     "OMS - View order" (ou Orders Full Access).
 *
 * Nos testes, a implementação é um fake em memória — sem rede, sem mock de
 * módulo, sem monkey patch.
 * -----------------------------------------------------------------------------
 */

export interface HttpClient {
  /**
   * `path` é sempre relativo à raiz da conta (ex.: '/api/oms/pvt/orders').
   * `params` vira query string; valores já chegam prontos para serialização.
   */
  get<T>(path: string, params: Record<string, string | number>): Promise<T>
}
