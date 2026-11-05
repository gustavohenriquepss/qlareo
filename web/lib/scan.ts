/**
 * Regras da leitura de QR code, sem dependência de Next nem de Supabase, para
 * poderem ser testadas sozinhas (`tests/unit/scan.test.mts`).
 */
import { createHash } from "node:crypto";

/**
 * Quem pede a URL sem ser uma pessoa lendo a sacola: prévias de link (WhatsApp,
 * Instagram, Telegram…), buscadores e ferramentas de linha de comando. Esses
 * são redirecionados normalmente, mas não contam como leitura. O caso que mais
 * importa é a prévia do WhatsApp: alguém manda o link para um amigo e, sem este
 * filtro, cada conversa viraria uma leitura falsa.
 */
const BOT_RE =
  /bot\b|crawler|spider|preview|facebookexternalhit|facebot|whatsapp|telegram|slack|discord|skype|linkedin|embedly|curl\/|wget\/|python-requests|httpclient|go-http-client|okhttp|headless/i;

export function isBot(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true; // navegador de verdade sempre manda user agent
  return BOT_RE.test(userAgent);
}

/** Dia corrente no fuso do piloto (RJ), em YYYY-MM-DD. É o que roda o hash à meia-noite local. */
export function scanDay(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Identificador anônimo do visitante, válido por um dia.
 *
 * O segredo impede quem tiver o banco de testar IPs um a um até achar o hash
 * (o espaço de IPv4 é pequeno). O dia no meio impede ligar a mesma pessoa entre
 * dias. Nem IP nem user agent saem daqui.
 */
export function visitorHash(secret: string, day: string, ip: string, userAgent: string): string {
  return createHash("sha256").update(`${secret}\n${day}\n${ip}\n${userAgent}`).digest("hex");
}

/**
 * IP de quem leu. Na Vercel, o `x-forwarded-for` é montado pela plataforma e o
 * primeiro item é o cliente; `x-real-ip` fica de reserva.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || headers.get("x-real-ip")?.trim() || "0.0.0.0";
}

/**
 * Destino só se for http(s). O banco já recusa outra coisa (check em
 * `campaigns.destination_url`); esta é a segunda conferência, na hora do
 * redirect, porque um `javascript:` aqui seria servido com o nosso domínio.
 */
export function safeDestination(value: string | null | undefined): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

/** Slug no formato que o banco aceita. Barra um pedido torto antes de ir ao banco. */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9-]{3,40}$/i.test(slug);
}
