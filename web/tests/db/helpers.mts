/**
 * Apoio dos testes de banco: um cliente admin (chave secreta, ignora RLS) para
 * montar o cenário e uma "pessoa" com sessão própria (chave pública, sujeita à
 * RLS) para tentar furar o isolamento.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;

/** Motivo para pular, ou `false` quando dá para rodar. */
export const skip = !url || !publishable || !secret ? "sem Supabase local configurado" : false;

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const PASSWORD = "senha-teste-123";

export type Person = { id: string; email: string; client: SupabaseClient; advertiserId: string };

export function adminClient(): SupabaseClient {
  return createClient(url!, secret!, noSession);
}

export function anonClient(): SupabaseClient {
  return createClient(url!, publishable!, noSession);
}

/** Cria uma conta confirmada, entra com ela e devolve o anunciante criado pelo trigger. */
export async function createPerson(admin: SupabaseClient, company: string): Promise<Person> {
  const email = `teste-${randomUUID()}@teste.local`;
  const created = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: company, company_name: company },
  });
  assert.ifError(created.error);
  const id = created.data.user!.id;

  const client = anonClient();
  const signedIn = await client.auth.signInWithPassword({ email, password: PASSWORD });
  assert.ifError(signedIn.error);

  const member = await admin.from("advertiser_members").select("advertiser_id").eq("user_id", id).single();
  assert.ifError(member.error);

  return { id, email, client, advertiserId: member.data.advertiser_id as string };
}

/** Apaga a pessoa e o anunciante dela (campanhas e leituras vão junto, em cascata). */
export async function removePerson(admin: SupabaseClient, person: Person) {
  await admin.from("advertisers").delete().eq("id", person.advertiserId);
  await admin.auth.admin.deleteUser(person.id);
}

export async function makeOperator(admin: SupabaseClient, person: Person) {
  const { error } = await admin.from("operators").insert({ user_id: person.id });
  assert.ifError(error);
}
