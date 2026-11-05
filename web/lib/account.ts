import "server-only";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type Account = {
  userId: string;
  email: string;
  fullName: string | null;
  isOperator: boolean;
  advertisers: { id: string; name: string }[];
};

/**
 * Quem está usando o painel. As duas consultas passam pela RLS com a sessão do
 * usuário: os anunciantes vêm do vínculo em `advertiser_members`, e a linha de
 * `operators` só aparece para o próprio operador.
 *
 * `requireOperator` é para a área de operação: devolve 404 para conta comum. É
 * só para não mostrar a tela; quem barra a leitura e a escrita é a RLS.
 *
 * O proxy já manda quem não tem sessão para /entrar; o redirect aqui é a
 * segunda conferência, para o caso de a página ser chamada sem passar por ele.
 *
 * `cache`: layout e página chamam isto na mesma requisição, e só a primeira
 * chamada vai ao banco.
 */
export const requireAccount = cache(async function requireAccount(): Promise<Account> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/entrar");

  const [advertisers, operator] = await Promise.all([
    // Filtra pelo vínculo da própria conta: o operador LÊ todos os anunciantes
    // (RLS), mas os "dele" são só os que ele tem em `advertiser_members`.
    supabase
      .from("advertisers")
      .select("id, name, advertiser_members!inner(user_id)")
      .eq("advertiser_members.user_id", auth.user.id)
      .order("created_at"),
    supabase.from("operators").select("user_id").eq("user_id", auth.user.id).maybeSingle(),
  ]);

  if (advertisers.error) throw advertisers.error;
  if (operator.error) throw operator.error;

  return {
    userId: auth.user.id,
    email: auth.user.email ?? "",
    fullName: (auth.user.user_metadata?.full_name as string | undefined) ?? null,
    isOperator: operator.data !== null,
    advertisers: advertisers.data.map(({ id, name }) => ({ id, name })),
  };
});

export async function requireOperator(): Promise<Account> {
  const account = await requireAccount();
  if (!account.isOperator) notFound();
  return account;
}
