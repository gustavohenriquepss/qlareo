import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE_OPTIONS, supabaseEnv } from "./env";

/** Rotas que exigem sessão. Sem sessão, vão para /entrar. */
const PROTECTED = ["/painel", "/nova-senha"];

/** Rotas de quem ainda não entrou. Com sessão, vão para o painel. */
const GUEST_ONLY = ["/entrar", "/cadastro", "/recuperar-senha"];

function matches(pathname: string, prefixes: readonly string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Renova a sessão a cada requisição e faz o desvio otimista por rota.
 *
 * Isto NÃO é a autorização: o proxy só decide para onde mandar a pessoa. Quem
 * decide o que ela pode ler é a RLS do banco, em toda consulta.
 */
export async function updateSession(request: NextRequest) {
  const { url, key } = supabaseEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookieOptions: AUTH_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [header, value] of Object.entries(headers)) {
          response.headers.set(header, value);
        }
      },
    },
  });

  // `getClaims()` valida o JWT. Não troque por `getSession()`, que confia no
  // cookie sem conferir a assinatura.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const { pathname, search } = request.nextUrl;

  if (!signedIn && matches(pathname, PROTECTED)) {
    const to = request.nextUrl.clone();
    to.pathname = "/entrar";
    to.search = "";
    to.searchParams.set("next", `${pathname}${search}`);
    return redirectKeepingCookies(to, response);
  }

  if (signedIn && matches(pathname, GUEST_ONLY)) {
    const to = request.nextUrl.clone();
    to.pathname = "/painel";
    to.search = "";
    return redirectKeepingCookies(to, response);
  }

  return response;
}

/** Um redirect que não leva os cookies renovados derruba a sessão na volta. */
function redirectKeepingCookies(to: URL, from: NextResponse) {
  const redirect = NextResponse.redirect(to);
  for (const cookie of from.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  return redirect;
}
