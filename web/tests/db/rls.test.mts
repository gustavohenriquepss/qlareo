/**
 * Isolamento entre anunciantes, conferido contra um Supabase de verdade.
 *
 * O cadastro é aberto: qualquer pessoa cria conta. Então a pergunta que estes
 * testes respondem é "uma conta qualquer consegue ver ou mexer no que é de
 * outro anunciante?". A resposta tem que ser não, pela RLS, sem depender do app.
 *
 * Precisa do Supabase local (`npx supabase start`) e das variáveis
 * NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY e
 * SUPABASE_SECRET_KEY. Sem elas, os testes são pulados.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
const skip = !url || !publishable || !secret ? "sem Supabase local configurado" : false;

const PASSWORD = "senha-teste-123";
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

type Person = { id: string; email: string; client: SupabaseClient; advertiserId: string };

describe("RLS de identidade", { skip }, () => {
  const admin = skip ? (null as never) : createClient(url!, secret!, noSession);
  const people: Person[] = [];
  let alice: Person;
  let bruno: Person;
  let operador: Person;

  async function person(company: string): Promise<Person> {
    const email = `rls-${randomUUID()}@teste.local`;
    const created = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: company, company_name: company },
    });
    assert.ifError(created.error);
    const id = created.data.user!.id;

    const client = createClient(url!, publishable!, noSession);
    const signedIn = await client.auth.signInWithPassword({ email, password: PASSWORD });
    assert.ifError(signedIn.error);

    const member = await admin.from("advertiser_members").select("advertiser_id").eq("user_id", id).single();
    assert.ifError(member.error);

    const p = { id, email, client, advertiserId: member.data.advertiser_id as string };
    people.push(p);
    return p;
  }

  before(async () => {
    alice = await person("Loja da Alice");
    bruno = await person("Oficina do Bruno");
    operador = await person("Qlareo");
    const op = await admin.from("operators").insert({ user_id: operador.id });
    assert.ifError(op.error);
  });

  after(async () => {
    for (const p of people) {
      await admin.from("advertisers").delete().eq("id", p.advertiserId);
      await admin.auth.admin.deleteUser(p.id);
    }
  });

  test("o cadastro cria um anunciante com o nome da empresa", async () => {
    const { data, error } = await alice.client.from("advertisers").select("id, name");
    assert.ifError(error);
    assert.deepEqual(data, [{ id: alice.advertiserId, name: "Loja da Alice" }]);
  });

  test("um anunciante não lê o outro, nem pedindo pelo id", async () => {
    const { data, error } = await alice.client.from("advertisers").select("id").eq("id", bruno.advertiserId);
    assert.ifError(error);
    assert.deepEqual(data, []);
  });

  test("um anunciante não renomeia o outro", async () => {
    const { data, error } = await alice.client
      .from("advertisers")
      .update({ name: "invadido" })
      .eq("id", bruno.advertiserId)
      .select();
    assert.ifError(error);
    assert.deepEqual(data, []);

    const check = await admin.from("advertisers").select("name").eq("id", bruno.advertiserId).single();
    assert.equal(check.data?.name, "Oficina do Bruno");
  });

  test("ninguém se liga sozinho ao anunciante de outro", async () => {
    const { error } = await alice.client
      .from("advertiser_members")
      .insert({ advertiser_id: bruno.advertiserId, user_id: alice.id });
    assert.ok(error, "o insert deveria ser recusado");
  });

  test("conta comum não cria anunciante nem vira operador", async () => {
    const adv = await alice.client.from("advertisers").insert({ name: "Outro" });
    assert.ok(adv.error, "criar anunciante é só do operador");

    const op = await alice.client.from("operators").insert({ user_id: alice.id });
    assert.ok(op.error, "ninguém se promove a operador pelo app");
  });

  test("conta comum só vê os próprios vínculos e não vê operadores", async () => {
    const members = await alice.client.from("advertiser_members").select("user_id");
    assert.ifError(members.error);
    assert.deepEqual(members.data, [{ user_id: alice.id }]);

    const ops = await alice.client.from("operators").select("user_id");
    assert.ifError(ops.error);
    assert.deepEqual(ops.data, []);
  });

  test("visitante sem login não lê nada", async () => {
    const anon = createClient(url!, publishable!, noSession);
    for (const table of ["advertisers", "advertiser_members", "operators"]) {
      const { data } = await anon.from(table).select("*");
      assert.ok(!data || data.length === 0, `${table} vazou para o visitante`);
    }
  });

  test("as funções auxiliares não ficam expostas por RPC", async () => {
    const { error } = await alice.client.rpc("is_operator");
    assert.ok(error, "private.is_operator não deveria ser chamável pela API");
  });

  test("operador lê todos os anunciantes", async () => {
    const { data, error } = await operador.client
      .from("advertisers")
      .select("id")
      .in("id", [alice.advertiserId, bruno.advertiserId]);
    assert.ifError(error);
    assert.equal(data.length, 2);
  });
});
