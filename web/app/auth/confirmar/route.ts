import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";

const TYPES: readonly EmailOtpType[] = ["email", "signup", "recovery", "email_change"];

/**
 * Destino dos links de e-mail (confirmação de cadastro e troca de senha).
 * Aceita os dois formatos de link que o Supabase manda:
 *
 * 1. `token_hash` + `type` → `verifyOtp`. É o que os nossos modelos em
 *    `supabase/templates/` montam, e funciona em qualquer aparelho.
 * 2. `code` → `exchangeCodeForSession` (fluxo PKCE). É o que chega com o modelo
 *    PADRÃO do Supabase, que a produção usa enquanto não houver SMTP próprio (o
 *    plano gratuito não deixa trocar o modelo sem SMTP). Limitação: só funciona
 *    no MESMO navegador do cadastro, porque o verificador do PKCE fica num
 *    cookie de lá.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const code = params.get("code");
  const next = safeNext(params.get("next"));

  if (tokenHash && type && TYPES.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  } else if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  }

  const failed = new URL("/entrar", request.url);
  failed.searchParams.set("erro", "link");
  return NextResponse.redirect(failed);
}
