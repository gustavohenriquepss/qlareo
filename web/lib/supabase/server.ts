import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { AUTH_COOKIE_OPTIONS, supabaseEnv } from "./env";

/**
 * Cliente do Supabase para Server Components, Server Actions e Route Handlers.
 * Um por requisição: a biblioteca manda os cabeçalhos de no-cache só na
 * primeira escrita de cookie de cada cliente.
 */
export async function createClient() {
  // `cookies()` primeiro: marca a rota como dinâmica antes de qualquer outra
  // coisa, e o build não tenta pré-renderizar o painel (nem exige as variáveis).
  const cookieStore = await cookies();
  const { url, key } = supabaseEnv();

  return createServerClient(url, key, {
    cookieOptions: AUTH_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component não pode gravar cookie. Sem problema: o
          // `proxy.ts` renova a sessão antes de a página renderizar.
        }
      },
    },
  });
}
