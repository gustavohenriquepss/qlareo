/**
 * Endereço e chave pública do Supabase.
 *
 * As duas são `NEXT_PUBLIC_` de propósito: o navegador precisa delas, e a
 * chave publicável não dá acesso a nada sozinha. Quem protege os dados é a RLS
 * (ver `supabase/migrations/`). A chave secreta (service role) nunca entra no
 * app.
 */
export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Faltam NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. " +
        "Crie web/.env.local com os valores de `npx supabase status` (ver README).",
    );
  }

  return { url, key };
}

/**
 * Nome fixo do cookie de sessão. O padrão do Supabase deriva o nome do host da
 * API (`sb-127-auth-token` no Supabase local), e cookie não separa por porta:
 * dois projetos locais em 127.0.0.1 leriam a sessão um do outro.
 */
export const AUTH_COOKIE_OPTIONS = { name: "qlareo-auth" } as const;
