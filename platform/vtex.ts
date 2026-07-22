/**
 * platform/vtex.ts — monta o adapter VTEX de produção (usado pelo sync).
 * Isola a construção transporte+adapter num lugar só; um teste injeta um
 * adapter falso sem passar por aqui.
 */
import { type PlatformAdapter } from '../core'
import { VtexAdapter } from '../adapters/vtex'
import { FetchHttpClient, type VtexCredentials } from '../transport/fetchHttpClient'

export function buildVtexAdapter(creds: VtexCredentials): PlatformAdapter {
  return new VtexAdapter(new FetchHttpClient(creds))
}
