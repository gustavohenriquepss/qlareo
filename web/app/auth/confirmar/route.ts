import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";

const TYPES: readonly EmailOtpType[] = ["email", "signup", "recovery", "email_change"];

/**
 * Destino dos links de e-mail (confirmação de cadastro e troca de senha).
 *
 * Usa `token_hash` + `verifyOtp`, e não o `?code=` do fluxo PKCE: o PKCE exige
 * abrir o link no MESMO navegador do cadastro, e quem se cadastra no
 * computador e abre o e-mail no celular cairia num erro. Os modelos de e-mail
 * em `supabase/templates/` montam este link.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const next = safeNext(params.get("next"));

  if (tokenHash && type && TYPES.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  }

  const failed = new URL("/entrar", request.url);
  failed.searchParams.set("erro", "link");
  return NextResponse.redirect(failed);
}
