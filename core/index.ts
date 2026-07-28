/**
 * core — a lógica de relatórios, independente de plataforma.
 * -----------------------------------------------------------------------------
 * Nada nesta pasta importa VTEX, Shopify ou qualquer outra plataforma: a única
 * forma de entrar aqui é pelo modelo canônico de `types.ts`, alimentado por um
 * `PlatformAdapter`.
 *
 * É por isso que esta pasta é o candidato natural a virar um pacote próprio
 * (`@sales-reports/core`) no dia em que houver um segundo consumidor — hoje ela
 * mora dentro de `node/` por uma restrição do builder da VTEX IO, que processa
 * a própria pasta e não alcançaria um diretório irmão na raiz do repo.
 * -----------------------------------------------------------------------------
 */

// Modelo canônico
export {
  type CanonicalItem,
  type CanonicalOrder,
  type CanonicalStatus,
  type DateRange,
  type ReportOptions,
  type SalesScope,
} from './types'

// Porta para as plataformas
export { type FetchOrdersOptions, type PlatformAdapter } from './adapter'

// Recorte de vendas
export { filterByScope } from './scope'

// Dinheiro e tempo
export { decimalsFor, parseDecimalToMinor, round, toMajor } from './money'
export { DEFAULT_TIMEZONE, type Grain, bucketKey, dayKeyInTz, isoWeek } from './time'

// Os relatórios
export {
  type ProductRow,
  type SkuRow,
  newVsReturning,
  promoEffectiveness,
  salesByPeriod,
  topProductsABC,
  topSkus,
} from './reports'
