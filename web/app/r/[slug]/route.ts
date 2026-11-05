import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { clientIp, isBot, isValidSlug, safeDestination, scanDay, visitorHash } from "@/lib/scan";
import { LANDING_URL } from "@/lib/site";
import { supabaseEnv } from "@/lib/supabase/env";

/**
 * /r/:slug — o link de cada QR code impresso nas sacolas.
 *
 * Grava a leitura e redireciona para o destino do anunciante. Três escolhas que
 * não podem mudar sem pensar:
 *
 * - **302, nunca 301/308.** Redirect permanente fica em cache no celular, e a
 *   segunda leitura da mesma pessoa nem passaria por aqui (não seria contada).
 * - **Sem sessão.** O proxy não roda nesta rota (ver `proxy.ts`), e o cliente
 *   do Supabase é anônimo: quem lê a sacola não tem conta, e a leitura não pode
 *   esperar uma ida ao Supabase Auth.
 * - **Uma chamada ao banco.** `record_scan` resolve o slug e grava a leitura
 *   de uma vez.
 */

let warnedMissingSecret = false;

/**
 * Segredo do hash do visitante. Em produção é obrigatório: sem ele, a leitura
 * redireciona mas não é contada (contar com hash sem segredo deixaria o IP
 * recuperável). Em desenvolvimento, um valor fixo.
 */
function hashSecret(): string | null {
  const secret = process.env.SCAN_HASH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV !== "production") return "dev-secret-nao-usar-em-producao";
  if (!warnedMissingSecret) {
    console.error("[qr] SCAN_HASH_SECRET ausente: leituras não estão sendo contadas.");
    warnedMissingSecret = true;
  }
  return null;
}

function anonClient() {
  const { url, key } = supabaseEnv();
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function redirectTo(target: string | URL) {
  const response = NextResponse.redirect(target, 302);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("X-Robots-Tag", "noindex");
  // O anunciante vê que o visitante veio da Qlareo, sem o slug.
  response.headers.set("Referrer-Policy", "origin");
  return response;
}

async function handle(request: NextRequest, slug: string, countable: boolean) {
  if (!isValidSlug(slug)) return redirectTo(LANDING_URL);

  const userAgent = request.headers.get("user-agent");
  const secret = hashSecret();
  const countIt = countable && secret !== null && !isBot(userAgent);
  const visitor = countIt
    ? visitorHash(secret, scanDay(), clientIp(request.headers), userAgent ?? "")
    : "";

  const { data, error } = await anonClient().rpc("record_scan", {
    scan_slug: slug,
    visitor,
    count_it: countIt,
  });

  if (error) {
    // Sem o banco não há como saber o destino. A pessoa cai na landing, que é
    // melhor que uma página de erro na frente do restaurante.
    console.error("[qr] falha ao registrar leitura", { slug, code: error.code, message: error.message });
    return redirectTo(LANDING_URL);
  }

  const destination = safeDestination(typeof data === "string" ? data : null);
  return redirectTo(destination ?? LANDING_URL);
}

type Context = { params: Promise<{ slug: string }> };

export async function GET(request: NextRequest, { params }: Context) {
  const { slug } = await params;
  return handle(request, slug, true);
}

/** HEAD é verificação de link (antivírus, prévias), não leitura: resolve sem contar. */
export async function HEAD(request: NextRequest, { params }: Context) {
  const { slug } = await params;
  return handle(request, slug, false);
}
