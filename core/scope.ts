/**
 * Recorte de vendas — "o que conta como venda".
 * -----------------------------------------------------------------------------
 * Decisão de NEGÓCIO, explícita e configurável. Nunca hardcode um recorte só:
 * dois relatórios sobre conjuntos de status diferentes jamais reconciliam, e o
 * lojista perde a confiança nos números.
 *
 *   bruto   = entrou pagamento (inclui cancelamento POSTERIOR ao pagamento)
 *   liquido = bruto menos cancelados e estornados
 *   todos   = sem recorte
 *
 * O filtro é por EXCLUSÃO. Combinado com o `mapStatus` de cada adapter — que
 * classifica status desconhecido como `paid` —, isso garante que um status
 * customizado do workflow da loja nunca desapareça silenciosamente do relatório.
 * -----------------------------------------------------------------------------
 */
import { type CanonicalOrder, type CanonicalStatus, type SalesScope } from './types'

/** Status removidos em cada recorte. Tudo que não está aqui, entra. */
const EXCLUDED_BY_SCOPE: Record<SalesScope, CanonicalStatus[]> = {
  // nunca entrou dinheiro
  bruto: ['pending'],
  // não entrou, ou entrou e voltou
  liquido: ['pending', 'canceled', 'refunded'],
  todos: [],
}

export function filterByScope(
  orders: CanonicalOrder[],
  scope: SalesScope = 'liquido'
): CanonicalOrder[] {
  const excluded = new Set<CanonicalStatus>(EXCLUDED_BY_SCOPE[scope] ?? [])
  if (excluded.size === 0) return orders
  return orders.filter((o) => !excluded.has(o.status))
}
