/**
 * preAuthTenant.ts — a ponte, e a ÚNICA exceção à regra de `server/tenant.ts`.
 * -----------------------------------------------------------------------------
 * ⚠️ ESTE ARQUIVO TEM DATA DE VALIDADE. Some na GUS-66 (3.1), quando o Clerk
 * passar a produzir sessões de verdade.
 *
 * O problema que ele resolve: `resolveTenant` exige uma sessão, e não existe
 * autenticação até a Fase 3. Sem uma ponte, o servidor não subiria e o
 * `npm run seed` — o único ambiente de teste que controlamos, já que o Qlareo
 * roda sempre com credencial de cliente — pararia de funcionar durante três
 * fases.
 *
 * A forma da ponte importa. Ela NÃO produz um `Tenant` por fora: produz um
 * `TenantDirectory` degenerado, de uma loja só, e o `Tenant` continua saindo de
 * `resolveTenant` como qualquer outro. Assim o caminho de código é o mesmo hoje
 * e depois do Clerk — a Fase 3 troca o diretório, não a costura. Se a ponte
 * devolvesse `{ orgId, storeAccount }` direto, existiriam dois caminhos, e o
 * segundo é sempre o que sobrevive por engano.
 *
 * O que ela NÃO faz, e não deve passar a fazer: autorizar. Não há usuário, não
 * há vínculo, não há verificação. O que protege o endpoint hoje é a
 * `QLAREO_API_KEY`, exatamente como antes desta issue — nem mais, nem menos.
 * -----------------------------------------------------------------------------
 */
import {
  type Session,
  type TenantDirectory,
  type TenantResolver,
  resolveTenant,
} from './tenant'

/**
 * Sessão de marcador. Os ids não referenciam nenhuma linha real: com o
 * diretório de uma loja só, ninguém os consulta. São strings reconhecíveis para
 * que aparecer num log seja obviamente um bug, e não um id plausível.
 */
export const PRE_AUTH_SESSION: Session = {
  userId: 'pre-auth-sem-usuario',
  orgId: 'pre-auth-sem-org',
}

/**
 * Diretório de UMA loja: responde sempre a mesma conta, para qualquer sessão.
 * É o comportamento single-tenant de hoje, dito em voz alta em vez de escondido
 * num `config.vtex.account` passado adiante.
 */
export function singleTenantDirectory(storeAccount: string): TenantDirectory {
  const conta = storeAccount.trim()
  if (!conta) {
    // Falha na subida, não na primeira requisição: uma conta vazia viraria um
    // filtro `store_account = ''`, que não casa com nada e devolveria relatório
    // vazio com cara de "não vendeu nada".
    throw new Error(
      'singleTenantDirectory: storeAccount vazio. Defina VTEX_ACCOUNT.'
    )
  }

  return {
    async findStoreAccount(): Promise<string | null> {
      return conta
    },
    async hasMembership(): Promise<boolean> {
      return true
    },
  }
}

/**
 * O `TenantResolver` que `createApp` consome enquanto não há autenticação.
 * Ignora a requisição — não há nada nela que identifique alguém — mas passa
 * pelo mesmo `resolveTenant` de sempre.
 */
export function preAuthTenantResolver(storeAccount: string): TenantResolver {
  const directory = singleTenantDirectory(storeAccount)
  return () => resolveTenant(directory, PRE_AUTH_SESSION)
}
