/**
 * Vocabulário e validação das campanhas e restaurantes. Sem dependência de
 * servidor: os formulários da área do operador usam, e os testes também.
 *
 * O banco confere tudo de novo (checks em `20261104000002_campanhas_e_leituras.sql`);
 * a validação aqui existe para devolver o erro no campo certo, em português.
 */

/**
 * Onde vai a arte. Cada sacola tem uma marca só; o anunciante escolhe um lado
 * ou os dois (frente e verso, 25% a mais). O preço mora na landing.
 */
export const SIDES = ["um_lado", "frente_e_verso"] as const;
export const STATUSES = ["aguardando_arte", "em_producao", "em_circulacao", "encerrada"] as const;

export type Sides = (typeof SIDES)[number];
export type Status = (typeof STATUSES)[number];

export const SIDES_LABEL: Record<Sides, string> = {
  um_lado: "Um lado",
  frente_e_verso: "Frente e verso",
};

export const SIDES_HINT: Record<Sides, string> = {
  um_lado: "Uma arte, num lado da sacola",
  frente_e_verso: "Duas artes, uma em cada lado (25% a mais)",
};

export const STATUS_LABEL: Record<Status, string> = {
  aguardando_arte: "Aguardando arte",
  em_producao: "Em produção",
  em_circulacao: "Em circulação",
  encerrada: "Encerrada",
};

/** Cor do selo: verde no ar, âmbar quando espera alguém (a arte), neutro no resto. */
export function statusTone(status: Status) {
  if (status === "em_circulacao") return "positive" as const;
  if (status === "aguardando_arte") return "warning" as const;
  return "neutral" as const;
}

/** "2026-11-05" → "05/11/2026", sem passar por `Date` (que puxaria o fuso). */
export function formatDay(day: string | null) {
  if (!day) return null;
  const [y, m, d] = day.split("-");
  return `${d}/${m}/${y}`;
}

export function periodLabel(startsOn: string | null, endsOn: string | null) {
  const start = formatDay(startsOn);
  const end = formatDay(endsOn);
  if (start && end) return `${start} a ${end}`;
  if (start) return `A partir de ${start}`;
  if (end) return `Até ${end}`;
  return "Sem datas";
}

// ---------------------------------------------------------------------------
// Validação
// ---------------------------------------------------------------------------

export type Parsed<T> =
  | { ok: true; data: T }
  | { ok: false; fields: Record<string, string>; values: Record<string, string> };

type Source = { get(name: string): FormDataEntryValue | null };

function text(source: Source, name: string) {
  const value = source.get(name);
  return typeof value === "string" ? value.trim() : "";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
/** O mesmo padrão do check `campaigns.destination_url`. */
const URL_RE = /^https?:\/\/[^\s/$.?#][^\s]*$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function isDay(value: string) {
  if (!DAY_RE.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/**
 * Link de destino do QR. Aceita colado sem `https://` (o operador copia
 * `wa.me/55…` do WhatsApp) e completa; recusa qualquer esquema que não seja
 * http(s).
 */
export function normalizeDestination(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!url.hostname.includes(".")) return null;
  return URL_RE.test(url.href) ? url.href : null;
}

export type RestaurantInput = { name: string; city: string; neighborhood: string | null };

export function parseRestaurant(source: Source): Parsed<RestaurantInput> {
  const values = {
    name: text(source, "name"),
    city: text(source, "city"),
    neighborhood: text(source, "neighborhood"),
  };
  const fields: Record<string, string> = {};

  if (!values.name) fields.name = "Informe o nome do restaurante.";
  else if (values.name.length > 120) fields.name = "Use até 120 caracteres.";
  if (!values.city) fields.city = "Informe a cidade.";
  else if (values.city.length > 80) fields.city = "Use até 80 caracteres.";
  if (values.neighborhood.length > 80) fields.neighborhood = "Use até 80 caracteres.";

  if (Object.keys(fields).length) return { ok: false, fields, values };
  return { ok: true, data: { ...values, neighborhood: values.neighborhood || null } };
}

export type CampaignInput = {
  advertiser_id: string;
  name: string;
  sides: Sides;
  destination_url: string;
  starts_on: string | null;
  ends_on: string | null;
  status?: Status;
};

/** `withStatus`: o formulário de edição também muda o status; o de criação nasce em "aguardando arte". */
export function parseCampaign(source: Source, { withStatus = false } = {}): Parsed<CampaignInput> {
  const values = {
    advertiser_id: text(source, "advertiser_id"),
    name: text(source, "name"),
    sides: text(source, "sides"),
    destination_url: text(source, "destination_url"),
    starts_on: text(source, "starts_on"),
    ends_on: text(source, "ends_on"),
    status: text(source, "status"),
  };
  const fields: Record<string, string> = {};

  if (!isUuid(values.advertiser_id)) fields.advertiser_id = "Escolha o anunciante.";
  if (!values.name) fields.name = "Dê um nome para a campanha.";
  else if (values.name.length > 120) fields.name = "Use até 120 caracteres.";

  const sides = (SIDES as readonly string[]).includes(values.sides) ? (values.sides as Sides) : null;
  if (!sides) fields.sides = "Escolha se a arte vai num lado ou nos dois.";

  const destination = normalizeDestination(values.destination_url);
  if (!values.destination_url) fields.destination_url = "Informe para onde o QR leva.";
  else if (!destination) fields.destination_url = "Use um link de site ou de WhatsApp, como wa.me/5521…";

  if (values.starts_on && !isDay(values.starts_on)) fields.starts_on = "Data inválida.";
  if (values.ends_on && !isDay(values.ends_on)) fields.ends_on = "Data inválida.";
  if (!fields.starts_on && !fields.ends_on && values.starts_on && values.ends_on && values.ends_on < values.starts_on) {
    fields.ends_on = "O fim vem depois do início.";
  }

  let status: Status | undefined;
  if (withStatus) {
    if ((STATUSES as readonly string[]).includes(values.status)) status = values.status as Status;
    else fields.status = "Escolha o status.";
  }

  if (Object.keys(fields).length) return { ok: false, fields, values };
  return {
    ok: true,
    data: {
      advertiser_id: values.advertiser_id,
      name: values.name,
      sides: sides!,
      destination_url: destination!,
      starts_on: values.starts_on || null,
      ends_on: values.ends_on || null,
      ...(status ? { status } : {}),
    },
  };
}

/** Teto do check `campaign_restaurants.bags`: só pega dígito a mais. */
export const MAX_BAGS = 1_000_000;

type Entries = { entries(): IterableIterator<[string, FormDataEntryValue]> };

/**
 * Sacolas por restaurante, de campos `bags:<id da ligação>`. Aceita ponto de
 * milhar ("1.200"); vazio conta como zero.
 */
export function parseBags(source: Entries): Parsed<{ id: string; bags: number }[]> {
  const values: Record<string, string> = {};
  const fields: Record<string, string> = {};
  const data: { id: string; bags: number }[] = [];

  for (const [key, raw] of source.entries()) {
    if (!key.startsWith("bags:") || typeof raw !== "string") continue;
    const id = key.slice("bags:".length);
    if (!isUuid(id)) continue;
    const value = raw.trim();
    values[key] = value;
    const digits = value.replace(/\./g, "");
    if (digits && !/^\d+$/.test(digits)) fields[key] = "Use só números.";
    else if (Number(digits) > MAX_BAGS) fields[key] = "Número alto demais.";
    else data.push({ id, bags: digits ? Number(digits) : 0 });
  }

  if (Object.keys(fields).length) return { ok: false, fields, values };
  return { ok: true, data };
}

/** "1.200 sacolas", "1 sacola", "Nenhuma sacola". */
export function bagsLabel(bags: number) {
  if (bags === 0) return "Nenhuma sacola";
  return bags === 1 ? "1 sacola" : `${bags.toLocaleString("pt-BR")} sacolas`;
}

/** "1.200 leituras", "1 leitura", "Nenhuma leitura". */
export function scansLabel(scans: number) {
  if (scans === 0) return "Nenhuma leitura";
  return scans === 1 ? "1 leitura" : `${scans.toLocaleString("pt-BR")} leituras`;
}

/** Nome de arquivo para a gráfica: só ASCII, minúsculo, com hífen. */
export function fileSlug(...parts: string[]) {
  return parts
    .join("-")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
