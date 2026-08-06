/**
 * tenant.ts — o ÚNICO lugar do projeto que produz um `storeAccount`.
 * -----------------------------------------------------------------------------
 * `PostgresOrderStore` já trata isolamento como invariante: toda query filtra
 * por `store_account`, sempre parametrizado. Isso protege contra SQL malformado,
 * não contra o filtro CERTO com o valor ERRADO. Se o `storeAccount` puder vir de
 * uma query string, de um header ou de um default, o isolamento inteiro vale o
 * quanto vale quem preencheu esse campo.
 *
 * Daí a regra: `storeAccount` nasce aqui, de `resolveTenant`, ou não nasce.
 *
 * A garantia real está no JOIN de `TenantDirectory`: a conta VTEX é alcançada
 * ATRAVÉS de `memberships`. Pedir a conta de uma org da qual o usuário não é
 * membro não devolve "proibido" — devolve nada, porque a linha não existe. Não
 * há checagem de permissão para alguém esquecer de fazer; a ausência do vínculo
 * já é a negativa.
 *
 * Fluxo completo:
 *
 *     sessão (userId, orgId)  ->  resolveTenant  ->  { orgId, storeAccount }
 *                                       |
 *                              TenantDirectory (memberships ⋈ vtex_accounts)
 *
 * Quem produz a sessão muda por fase — hoje `server/preAuthTenant.ts`, na 3.1 o
 * Clerk. `resolveTenant` não muda: é sempre o mesmo caminho.
 * -----------------------------------------------------------------------------
 */

import { type IncomingMessage } from 'node:http'

/**
 * O que a sessão precisa carregar. `userId` é o `users.id` NOSSO, não o
 * `clerk_user_id` — a tradução acontece na borda da autenticação (3.1), e daqui
 * para dentro só existe id local, que é o que `memberships` referencia.
 */
export interface Session {
  userId: string
  /** Org ativa. Um usuário pode ter N vínculos; a sessão diz em qual ele está. */
  orgId: string
}

/** O resultado: a única forma legítima de saber de qual loja são os dados. */
export interface Tenant {
  orgId: string
  storeAccount: string
}

/**
 * O que `createApp` recebe: dada a requisição, qual tenant. Junta ler a sessão
 * (muda por fase) com `resolveTenant` (não muda). É por aqui que a 3.1 entra
 * sem tocar em `main.ts`.
 */
export type TenantResolver = (req: IncomingMessage) => Promise<Tenant>

export type TenantErrorCode =
  /** A sessão não tem vínculo com a org pedida — ou a org não existe. */
  | 'sem-vinculo'
  /** Vínculo existe, mas a org ainda não conectou uma conta VTEX (onboarding). */
  | 'sem-conta'

export class TenantResolutionError extends Error {
  // Campo explícito, não parameter property: type stripping do Node não aceita
  // `constructor(public readonly code)` (ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX).
  readonly code: TenantErrorCode

  constructor(code: TenantErrorCode, message: string) {
    super(message)
    this.name = 'TenantResolutionError'
    this.code = code
  }
}

/**
 * Porta de consulta ao diretório de tenancy. Uma implementação lê do Postgres
 * (produção); outra devolve uma loja fixa (ponte pré-autenticação).
 */
export interface TenantDirectory {
  /**
   * `account_name` da org — SE, e somente se, o usuário da sessão for membro
   * dela. `null` quando não há vínculo OU quando a org não tem conta VTEX; as
   * duas situações são indistinguíveis daqui de propósito, ver `resolveTenant`.
   */
  findStoreAccount(session: Session): Promise<string | null>

  /** A org existe e o usuário é membro? Só para distinguir a mensagem de erro. */
  hasMembership(session: Session): Promise<boolean>
}

/**
 * Resolve o tenant da sessão. Lança `TenantResolutionError` em vez de devolver
 * null: um `storeAccount` ausente NUNCA pode virar `undefined` que atravessa a
 * camada de dados e vira "sem filtro".
 */
export async function resolveTenant(
  directory: TenantDirectory,
  session: Session
): Promise<Tenant> {
  const storeAccount = await directory.findStoreAccount(session)
  if (storeAccount) {
    return { orgId: session.orgId, storeAccount }
  }

  // Só aqui, DEPOIS de já ter falhado, vale distinguir os dois casos — e o custo
  // é uma segunda consulta que só roda no caminho de erro. Antes de falhar não
  // perguntamos "ele é membro?", porque a resposta não mudaria nada: sem linha,
  // sem dado.
  const membro = await directory.hasMembership(session)
  if (!membro) {
    throw new TenantResolutionError(
      'sem-vinculo',
      'Sessão sem vínculo com esta organização.'
    )
  }
  throw new TenantResolutionError(
    'sem-conta',
    'Organização ainda não conectou uma conta VTEX.'
  )
}
