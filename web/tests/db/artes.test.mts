/**
 * Artes: o anunciante manda versão nova para a própria campanha enquanto ela
 * espera arte, e só isso. Ninguém de fora lê, baixa ou envia; a revisão é do
 * operador.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, anonClient, createPerson, makeOperator, removePerson, skip, type Person } from "./helpers.mts";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

describe("artes", { skip }, () => {
  const admin = skip ? (null as never) : adminClient();
  let alice: Person;
  let bob: Person;
  let operador: Person;
  let dois: string; // campanha frente e verso da Alice
  let um: string; // campanha de um lado da Alice
  const uploaded: string[] = [];

  async function campaign(advertiserId: string, sides: "um_lado" | "frente_e_verso") {
    const { data, error } = await admin
      .from("campaigns")
      .insert({ advertiser_id: advertiserId, name: `Artes ${sides}`, sides, destination_url: "https://alice.example/" })
      .select("id")
      .single();
    assert.ifError(error);
    return data.id as string;
  }

  /** Sobe um PNG pelo caminho do app: URL assinada com a sessão de quem envia. */
  async function upload(client: SupabaseClient, campaignId: string) {
    const path = `${campaignId}/${randomUUID()}.png`;
    const signed = await client.storage.from("artes").createSignedUploadUrl(path);
    if (signed.error) return { path, error: signed.error };
    const put = await client.storage
      .from("artes")
      .uploadToSignedUrl(path, signed.data.token, PNG, { contentType: "image/png" });
    if (!put.error) uploaded.push(path);
    return { path, error: put.error };
  }

  function row(campaignId: string, path: string, extra: Record<string, unknown> = {}) {
    return {
      campaign_id: campaignId,
      side: "frente",
      storage_path: path,
      file_name: "arte.png",
      content_type: "image/png",
      size_bytes: PNG.length,
      ...extra,
    };
  }

  before(async () => {
    alice = await createPerson(admin, "Loja da Alice");
    bob = await createPerson(admin, "Loja do Bob");
    operador = await createPerson(admin, "Qlareo");
    await makeOperator(admin, operador);
    dois = await campaign(alice.advertiserId, "frente_e_verso");
    um = await campaign(alice.advertiserId, "um_lado");
  });

  after(async () => {
    if (uploaded.length) await admin.storage.from("artes").remove(uploaded);
    for (const p of [alice, bob, operador]) if (p) await removePerson(admin, p);
  });

  test("anunciante sobe a arte e registra a versão em revisão", async () => {
    const sent = await upload(alice.client, dois);
    assert.ifError(sent.error);

    const info = await alice.client.storage.from("artes").info(sent.path);
    assert.ifError(info.error);
    assert.equal(info.data.size, PNG.length);
    assert.equal(info.data.contentType, "image/png");

    const { data, error } = await alice.client.from("artworks").insert(row(dois, sent.path)).select("status, uploaded_by").single();
    assert.ifError(error);
    assert.equal(data.status, "em_revisao");
    assert.equal(data.uploaded_by, alice.id);
  });

  test("anunciante não se aprova, não muda nem apaga a versão", async () => {
    const sent = await upload(alice.client, dois);
    assert.ifError(sent.error);
    const approved = await alice.client.from("artworks").insert(row(dois, sent.path, { status: "aprovada" }));
    assert.equal(approved.error?.code, "42501", "anunciante gravou arte já aprovada");

    const own = await alice.client.from("artworks").insert(row(dois, sent.path)).select("id").single();
    assert.ifError(own.error);
    const changed = await alice.client.from("artworks").update({ status: "aprovada" }).eq("id", own.data.id).select("id");
    assert.deepEqual(changed.data ?? [], [], "anunciante aprovou a própria arte");
    const removed = await alice.client.from("artworks").delete().eq("id", own.data.id).select("id");
    assert.deepEqual(removed.data ?? [], [], "anunciante apagou uma versão");

    const overwrite = await alice.client.storage.from("artes").upload(sent.path, PNG, { contentType: "image/png", upsert: true });
    assert.ok(overwrite.error, "anunciante sobrescreveu o arquivo de uma versão");
    const gone = await alice.client.storage.from("artes").remove([sent.path]);
    assert.deepEqual(gone.data ?? [], [], "anunciante apagou o arquivo de uma versão");
  });

  test("o bucket só aceita PDF, PNG e JPG", async () => {
    const path = `${dois}/${randomUUID()}.png`;
    const signed = await alice.client.storage.from("artes").createSignedUploadUrl(path);
    assert.ifError(signed.error);
    const html = await alice.client.storage
      .from("artes")
      .uploadToSignedUrl(path, signed.data.token, Buffer.from("<script>alert(1)</script>"), { contentType: "text/html" });
    assert.ok(html.error, "bucket aceitou HTML");
  });

  test("campanha de um lado não recebe verso", async () => {
    const sent = await upload(alice.client, um);
    assert.ifError(sent.error);
    const verso = await alice.client.from("artworks").insert(row(um, sent.path, { side: "verso" }));
    assert.equal(verso.error?.code, "23514");
  });

  test("a versão aponta para um arquivo da própria campanha", async () => {
    const sent = await upload(alice.client, dois);
    assert.ifError(sent.error);
    const crossed = await alice.client.from("artworks").insert(row(um, sent.path));
    assert.equal(crossed.error?.code, "23514", "versão de uma campanha apontou para arquivo de outra");
  });

  test("outra conta não envia, não lê e não baixa", async () => {
    const intruder = await upload(bob.client, dois);
    assert.ok(intruder.error, "Bob conseguiu URL de envio para a campanha da Alice");

    const sent = await upload(alice.client, dois);
    assert.ifError(sent.error);
    const forged = await bob.client.from("artworks").insert(row(dois, sent.path));
    assert.ok(forged.error, "Bob registrou versão na campanha da Alice");

    const listed = await bob.client.from("artworks").select("id").eq("campaign_id", dois);
    assert.deepEqual(listed.data, []);
    const link = await bob.client.storage.from("artes").createSignedUrl(sent.path, 60);
    assert.ok(link.error, "Bob gerou link para baixar a arte da Alice");
    const anon = await anonClient().storage.from("artes").createSignedUrl(sent.path, 60);
    assert.ok(anon.error, "visitante gerou link para baixar a arte");
    const anonRows = await anonClient().from("artworks").select("id");
    assert.ok(anonRows.error || (anonRows.data ?? []).length === 0, "visitante leu artes");
  });

  test("depois que a campanha sai de 'aguardando arte', o anunciante não manda mais", async () => {
    const later = await campaign(alice.advertiserId, "um_lado");
    const early = await upload(alice.client, later);
    assert.ifError(early.error);

    const moved = await admin.from("campaigns").update({ status: "em_producao" }).eq("id", later);
    assert.ifError(moved.error);

    const late = await upload(alice.client, later);
    assert.ok(late.error, "anunciante pegou URL de envio com a campanha em produção");
    const registered = await alice.client.from("artworks").insert(row(later, early.path));
    assert.equal(registered.error?.code, "42501", "anunciante registrou versão com a campanha em produção");

    const byOperator = await upload(operador.client, later);
    assert.ifError(byOperator.error);
  });

  test("operador revisa: ajuste exige nota, e o anunciante lê o resultado", async () => {
    const sent = await upload(alice.client, dois);
    assert.ifError(sent.error);
    const own = await alice.client.from("artworks").insert(row(dois, sent.path, { side: "verso" })).select("id").single();
    assert.ifError(own.error);

    const noNote = await operador.client.from("artworks").update({ status: "ajustes" }).eq("id", own.data.id);
    assert.equal(noNote.error?.code, "23514", "ajuste sem nota passou");

    const asked = await operador.client
      .from("artworks")
      .update({ status: "ajustes", review_note: "Aumente o QR.", reviewed_at: new Date().toISOString() })
      .eq("id", own.data.id)
      .select("status")
      .single();
    assert.ifError(asked.error);

    const seen = await alice.client.from("artworks").select("status, review_note").eq("id", own.data.id).single();
    assert.ifError(seen.error);
    assert.deepEqual(seen.data, { status: "ajustes", review_note: "Aumente o QR." });

    const link = await operador.client.storage.from("artes").createSignedUrl(sent.path, 60);
    assert.ifError(link.error);
  });
});
