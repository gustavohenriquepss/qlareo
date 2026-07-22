/**
 * Dinheiro — unidades mínimas inteiras dentro, decimal só na saída.
 * -----------------------------------------------------------------------------
 * O bug nº 1 deste domínio é tratar centavos como reais (infla receita 100×).
 * O segundo é somar float e acumular erro de arredondamento.
 *
 * Regra: o core soma SEMPRE em inteiro (unidade mínima) e só converte para
 * decimal na borda, ao montar a resposta. Por isso `toMajor` aparece nos
 * relatórios apenas no final da agregação, nunca dentro do laço de soma.
 * -----------------------------------------------------------------------------
 */

/**
 * Casas decimais por moeda. Cobre o caso do core (moedas de 2 casas) e deixa
 * explícito que a premissa existe, em vez de espalhar `/100` pelo código.
 *
 * Moedas sem subunidade (JPY, KRW) ou com 3 casas (BHD, KWD) precisam de
 * entrada aqui antes de serem suportadas de verdade.
 */
const DECIMALS: Record<string, number> = {
  BRL: 2,
  USD: 2,
  EUR: 2,
  GBP: 2,
  ARS: 2,
  CLP: 0,
  JPY: 0,
}

const DEFAULT_DECIMALS = 2

export function decimalsFor(currency: string): number {
  const d = DECIMALS[currency.toUpperCase()]
  return d === undefined ? DEFAULT_DECIMALS : d
}

/**
 * Unidade mínima inteira -> valor decimal para exibição.
 * 14990 (BRL) -> 149.9
 */
export function toMajor(minor: number, currency = 'BRL'): number {
  const factor = Math.pow(10, decimalsFor(currency))
  return round(minor / factor, decimalsFor(currency))
}

/**
 * Converte a representação decimal que algumas plataformas mandam como STRING
 * ("149.90") para unidade mínima inteira, sem passar por float intermediário
 * onde daria para evitar.
 *
 * Usado pelos adapters de plataformas que não entregam centavos (Shopify,
 * WooCommerce). A VTEX já entrega inteiro e não precisa disto.
 */
export function parseDecimalToMinor(value: string | number, currency = 'BRL'): number {
  const decimals = decimalsFor(currency)
  const text = typeof value === 'number' ? value.toFixed(decimals) : value.trim()

  const match = text.match(/^(-)?(\d+)(?:[.,](\d+))?$/)
  if (!match) {
    throw new Error(`Valor monetário inválido: "${value}"`)
  }

  const sign = match[1] ? -1 : 1
  const whole = match[2]
  const frac = (match[3] ?? '').padEnd(decimals, '0').slice(0, decimals)

  return sign * Number(whole + frac)
}

/** Arredonda para N casas sem os artefatos clássicos de float. */
export function round(value: number, decimals = 2): number {
  const factor = Math.pow(10, decimals)
  return Math.round((value + Number.EPSILON) * factor) / factor
}
