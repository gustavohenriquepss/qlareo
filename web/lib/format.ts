/**
 * Formatação pt-BR. Locale FIXO ('pt-BR'), nunca o locale do browser: um
 * relatório de faturamento em reais formatado como "1,234.56" para um usuário
 * com Chrome em inglês é um bug de confiança, não de estética. E, fixando o
 * locale, servidor e cliente renderizam o mesmo texto — sem erro de hidratação.
 */
import type { Grain } from "./types";

const LOCALE = "pt-BR";

const brl = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Compacto para eixo de gráfico, onde "R$ 1.234.567,89" não cabe. */
const brlCompact = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

const int = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });

const pct = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function formatMoney(value: number): string {
  return brl.format(value);
}

export function formatMoneyCompact(value: number): string {
  return brlCompact.format(value);
}

export function formatInt(value: number): string {
  return int.format(value);
}

/** O core já devolve o número em pontos percentuais (ex.: 42.5 = 42,5%). */
export function formatPercent(value: number): string {
  return `${pct.format(value)}%`;
}

/**
 * Rótulo de um bucket do relatório. O core devolve três formatos conforme a
 * granularidade ('2026-07-22', '2026-W30', '2026-07') e cada um lê melhor de um
 * jeito. Datas são montadas manualmente (sem `new Date`) para não reinterpretar
 * fuso: a string já vem truncada no fuso do relatório.
 */
export function formatBucket(bucket: string, grain: Grain): string {
  if (grain === "month") {
    const [year, month] = bucket.split("-");
    const nome = MESES[Number(month) - 1];
    return nome ? `${nome}/${year}` : bucket;
  }

  if (grain === "week") {
    const [year, week] = bucket.split("-W");
    return week ? `Sem ${week}/${year}` : bucket;
  }

  const [, month, day] = bucket.split("-");
  return month && day ? `${day}/${month}` : bucket;
}

/** Versão longa, para tooltip — onde cabe o ano e o dia da semana. */
export function formatBucketLong(bucket: string, grain: Grain): string {
  if (grain !== "day") return formatBucket(bucket, grain);
  const [year, month, day] = bucket.split("-");
  if (!year || !month || !day) return bucket;
  return `${day}/${month}/${year}`;
}

const MESES = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

/** '2026-07-22' → '22/07/2026', para o resumo do período no cabeçalho. */
export function formatISODate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return year && month && day ? `${day}/${month}/${year}` : iso;
}
