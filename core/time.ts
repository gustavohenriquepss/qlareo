/**
 * Tempo — truncar no fuso do relatório antes de agrupar.
 * -----------------------------------------------------------------------------
 * `createdAt` é UTC. Sem truncar no fuso da loja, a venda das 22h vira "venda
 * de amanhã" e a série diária mente. Este é o terceiro bug clássico do domínio.
 * -----------------------------------------------------------------------------
 */

export type Grain = 'day' | 'week' | 'month'

export const DEFAULT_TIMEZONE = 'America/Sao_Paulo'

/**
 * Data UTC -> chave 'YYYY-MM-DD' no fuso informado.
 * en-CA dá o formato ISO direto, sem montagem manual.
 */
export function dayKeyInTz(isoUtc: string, timezone = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(isoUtc))
}

/** Chave do bucket conforme o grão pedido. */
export function bucketKey(
  isoUtc: string,
  grain: Grain,
  timezone = DEFAULT_TIMEZONE
): string {
  const dayKey = dayKeyInTz(isoUtc, timezone)

  if (grain === 'day') return dayKey
  if (grain === 'month') return dayKey.slice(0, 7)

  const [y, m, d] = dayKey.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return `${y}-W${String(isoWeek(date)).padStart(2, '0')}`
}

/** Número da semana ISO-8601 (semana começa na segunda; semana 1 contém a 1ª quinta). */
export function isoWeek(date: Date): number {
  const d = new Date(date.getTime())
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}
