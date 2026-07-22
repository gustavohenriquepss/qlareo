/**
 * Filtros da tela (período, recorte, granularidade) — a única fonte de verdade
 * do que a UI pede ao backend.
 *
 * Os filtros vivem na QUERY STRING, não em estado de componente. Isso é
 * deliberado: uma tela de relatório precisa ser LINKÁVEL (mandar "o mês passado
 * no líquido" para um colega é um caso de uso real), o botão voltar precisa
 * funcionar, e o recorte precisa sobreviver a um reload. Como consequência, as
 * páginas são Server Components que leem `searchParams` e refazem a busca.
 */
import type { Grain, SalesScope } from "./types";

export interface Filters {
  from: string; // 'YYYY-MM-DD'
  to: string; // 'YYYY-MM-DD'
  scope: SalesScope;
  grain: Grain;
}

export const SCOPES: ReadonlyArray<{
  value: SalesScope;
  label: string;
  help: string;
}> = [
  {
    value: "liquido",
    label: "Líquido",
    help: "Pagos, menos cancelados e estornados",
  },
  { value: "bruto", label: "Bruto", help: "Tudo que teve pagamento aprovado" },
  { value: "todos", label: "Todos", help: "Sem recorte, inclui pendentes" },
];

export const GRAINS: ReadonlyArray<{ value: Grain; label: string }> = [
  { value: "day", label: "Dia" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mês" },
];

const SCOPE_VALUES = SCOPES.map((s) => s.value);
const GRAIN_VALUES = GRAINS.map((g) => g.value);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value: string | undefined): value is string {
  if (!value || !DATE_RE.test(value)) return false;
  return !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

/**
 * 'YYYY-MM-DD' no fuso LOCAL — não `toISOString()`, que formata em UTC. Num
 * fuso negativo (o Brasil é UTC-3), às 21h de hoje o UTC já é amanhã, e o
 * atalho "7 dias" pediria um dia que ainda não existe na loja.
 */
export function toISODate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Últimos 30 dias, terminando hoje. Default quando a URL não diz nada. */
export function defaultFilters(today = new Date()): Filters {
  const to = new Date(today);
  const from = new Date(today);
  from.setDate(from.getDate() - 29);
  return { from: toISODate(from), to: toISODate(to), scope: "liquido", grain: "day" };
}

type RawParams = Record<string, string | string[] | undefined>;

function one(params: RawParams, key: string): string | undefined {
  const v = params[key];
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Normaliza a query string. Parâmetro inválido cai no default em vez de
 * quebrar a tela — o backend valida de novo de qualquer jeito, e uma URL
 * editada à mão não deveria produzir erro 400 na cara do lojista.
 */
export function parseFilters(params: RawParams, today = new Date()): Filters {
  const fallback = defaultFilters(today);

  const from = one(params, "from");
  const to = one(params, "to");
  const scope = one(params, "scope");
  const grain = one(params, "grain");

  const parsed: Filters = {
    from: isValidDate(from) ? from : fallback.from,
    to: isValidDate(to) ? to : fallback.to,
    scope: SCOPE_VALUES.includes(scope as SalesScope)
      ? (scope as SalesScope)
      : fallback.scope,
    grain: GRAIN_VALUES.includes(grain as Grain)
      ? (grain as Grain)
      : fallback.grain,
  };

  // O backend exige from < to. Datas invertidas viram um intervalo válido em
  // vez de um 400 — corrigir é mais útil que reclamar.
  if (parsed.from > parsed.to) {
    return { ...parsed, from: parsed.to, to: parsed.from };
  }
  return parsed;
}

/**
 * Converte os filtros para o que a API espera. O backend pede ISO completo e
 * `from < to`; `to` vira o FIM do dia para que o último dia do intervalo entre
 * no relatório (senão "01 a 31" perderia o dia 31 inteiro).
 */
export function toApiQuery(f: Filters) {
  return {
    from: `${f.from}T00:00:00.000Z`,
    to: `${f.to}T23:59:59.999Z`,
    scope: f.scope,
    grain: f.grain,
  };
}

export function filtersToSearchParams(f: Filters): URLSearchParams {
  return new URLSearchParams({
    from: f.from,
    to: f.to,
    scope: f.scope,
    grain: f.grain,
  });
}

/** Atalhos de período. Rótulos curtos porque ficam numa linha só de filtros. */
export function rangePresets(today = new Date()) {
  const iso = toISODate;
  const daysAgo = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    return d;
  };
  const startOfMonth = (offset = 0) =>
    new Date(today.getFullYear(), today.getMonth() + offset, 1);
  const endOfMonth = (offset = 0) =>
    new Date(today.getFullYear(), today.getMonth() + offset + 1, 0);

  return [
    { label: "7 dias", from: iso(daysAgo(6)), to: iso(today), grain: "day" as Grain },
    { label: "30 dias", from: iso(daysAgo(29)), to: iso(today), grain: "day" as Grain },
    { label: "90 dias", from: iso(daysAgo(89)), to: iso(today), grain: "week" as Grain },
    {
      label: "Este mês",
      from: iso(startOfMonth()),
      to: iso(today),
      grain: "day" as Grain,
    },
    {
      label: "Mês passado",
      from: iso(startOfMonth(-1)),
      to: iso(endOfMonth(-1)),
      grain: "day" as Grain,
    },
  ];
}
