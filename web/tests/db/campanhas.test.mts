/**
 * Campanhas, QR codes e leituras: o que cada um enxerga e o que o visitante
 * anônimo consegue fazer (só ler um QR, via `record_scan`).
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { adminClient, anonClient, createPerson, makeOperator, removePerson, skip, type Person } from "./helpers.mts";

const visitor = (seed: string) => createHash("sha256").update(seed).digest("hex");

describe("campanhas e leituras", { skip }, () => {
  const admin = skip ? (null as never) : adminClient();
  const people: Person[] = [];
  const restaurantIds: string[] = [];
  let alice: Person;
  let bruno: Person;
  let operador: Person;
  let aliceCampaign: string;
  let brunoCampaign: string;
  let aliceSlug: string;
  let aliceQr: string;
  let brunoSlug: string;
  let sharedRestaurant: string;
  let otherRestaurant: string;

  async function restaurant(name: string) {
    const { data, error } = await admin
      .from("restaurants")
      .insert({ name, city: "Itaboraí", neighborhood: "Centro" })
      .select("id")
      .single();
    assert.ifError(error);
    restaurantIds.push(data.id);
    return data.id as string;
  }

  async function campaign(advertiserId: string, destination: string) {
    const { data, error } = await admin
      .from("campaigns")
      .insert({
        advertiser_id: advertiserId,
        name: "Teste",
        destination_url: destination,
      })
      .select("id")
      .single();
    assert.ifError(error);
    return data.id as string;
  }

  async function qr(campaignId: string, restaurantId: string) {
    const { data, error } = await admin
      .from("campaign_restaurants")
      .insert({ campaign_id: campaignId, restaurant_id: restaurantId })
      .select("id, slug")
      .single();
    assert.ifError(error);
    return data as { id: string; slug: string };
  }

  before(async () => {
    alice = await createPerson(admin, "Loja da Alice");
    bruno = await createPerson(admin, "Oficina do Bruno");
    operador = await createPerson(admin, "Qlareo");
    people.push(alice, bruno, operador);
    await makeOperator(admin, operador);

    sharedRestaurant = await restaurant(`Restaurante ${randomUUID()}`);
    otherRestaurant = await restaurant(`Só do Bruno ${randomUUID()}`);

    aliceCampaign = await campaign(alice.advertiserId, "https://alice.example/oferta");
    brunoCampaign = await campaign(bruno.advertiserId, "https://bruno.example/");

    const a = await qr(aliceCampaign, sharedRestaurant);
    aliceSlug = a.slug;
    aliceQr = a.id;
    brunoSlug = (await qr(brunoCampaign, otherRestaurant)).slug;
  });

  after(async () => {
    for (const p of people) await removePerson(admin, p);
    if (restaurantIds.length) await admin.from("restaurants").delete().in("id", restaurantIds);
  });

  test("o slug gerado é curto e sem caracteres que se confundem", () => {
    assert.match(aliceSlug, /^[a-hjkmnp-z2-9]{7}$/);
  });

  test("record_scan devolve o destino e grava a leitura", async () => {
    const anon = anonClient();
    const { data, error } = await anon.rpc("record_scan", { scan_slug: aliceSlug, visitor: visitor("v1") });
    assert.ifError(error);
    assert.equal(data, "https://alice.example/oferta");

    const scans = await admin.from("scans").select("visitor_hash").eq("campaign_restaurant_id", aliceQr);
    assert.deepEqual(scans.data, [{ visitor_hash: visitor("v1") }]);
  });

  test("record_scan com count_it falso resolve sem gravar", async () => {
    const before = await admin.from("scans").select("id", { count: "exact", head: true }).eq("campaign_restaurant_id", aliceQr);
    const { data } = await anonClient().rpc("record_scan", {
      scan_slug: aliceSlug.toUpperCase(),
      visitor: visitor("bot"),
      count_it: false,
    });
    assert.equal(data, "https://alice.example/oferta", "o slug não diferencia maiúscula");
    const after = await admin.from("scans").select("id", { count: "exact", head: true }).eq("campaign_restaurant_id", aliceQr);
    assert.equal(after.count, before.count);
  });

  test("slug desconhecido devolve nulo; hash inválido não grava", async () => {
    const unknown = await anonClient().rpc("record_scan", { scan_slug: "naoexiste", visitor: visitor("x") });
    assert.equal(unknown.data, null);

    const before = await admin.from("scans").select("id", { count: "exact", head: true }).eq("campaign_restaurant_id", aliceQr);
    await anonClient().rpc("record_scan", { scan_slug: aliceSlug, visitor: "ip-em-claro-200.1.2.3" });
    const after = await admin.from("scans").select("id", { count: "exact", head: true }).eq("campaign_restaurant_id", aliceQr);
    assert.equal(after.count, before.count);
  });

  test("visitante anônimo não lê nenhuma tabela", async () => {
    const anon = anonClient();
    for (const table of ["restaurants", "campaigns", "campaign_restaurants", "scans"]) {
      const { data } = await anon.from(table).select("*");
      assert.ok(!data || data.length === 0, `${table} vazou para o visitante`);
    }
  });

  test("anunciante vê só as próprias campanhas, QR e leituras", async () => {
    const campaigns = await alice.client.from("campaigns").select("id");
    assert.deepEqual(campaigns.data, [{ id: aliceCampaign }]);

    const qrs = await alice.client.from("campaign_restaurants").select("slug");
    assert.deepEqual(qrs.data, [{ slug: aliceSlug }]);

    const brunoScan = await anonClient().rpc("record_scan", { scan_slug: brunoSlug, visitor: visitor("b1") });
    assert.ifError(brunoScan.error);
    const scans = await alice.client.from("scans").select("campaign_restaurant_id");
    assert.ok(scans.data!.length > 0);
    assert.ok(scans.data!.every((s) => s.campaign_restaurant_id === aliceQr), "Alice viu leitura do Bruno");
  });

  test("anunciante vê só os restaurantes das próprias campanhas", async () => {
    const { data } = await alice.client.from("restaurants").select("id");
    assert.deepEqual(data, [{ id: sharedRestaurant }]);
  });

  test("anunciante não cria, muda nem apaga campanha, QR ou leitura", async () => {
    const insert = await alice.client
      .from("campaigns")
      .insert({ advertiser_id: alice.advertiserId, name: "x", destination_url: "https://x.com" });
    assert.ok(insert.error, "anunciante criou campanha");

    const redirect = await alice.client
      .from("campaigns")
      .update({ destination_url: "https://golpe.example" })
      .eq("id", aliceCampaign)
      .select();
    assert.deepEqual(redirect.data ?? [], [], "anunciante trocou o destino do QR");

    const forged = await alice.client
      .from("scans")
      .insert({ campaign_restaurant_id: aliceQr, visitor_hash: visitor("falso") });
    assert.ok(forged.error, "anunciante inventou leitura");

    const wiped = await alice.client.from("scans").delete().eq("campaign_restaurant_id", aliceQr).select();
    assert.ok(wiped.error || (wiped.data ?? []).length === 0, "anunciante apagou leitura");
  });

  test("operador lê tudo e gerencia campanhas", async () => {
    const campaigns = await operador.client.from("campaigns").select("id").in("id", [aliceCampaign, brunoCampaign]);
    assert.equal(campaigns.data?.length, 2);

    const update = await operador.client
      .from("campaigns")
      .update({ status: "em_circulacao" })
      .eq("id", aliceCampaign)
      .select("status")
      .single();
    assert.ifError(update.error);
    assert.equal(update.data.status, "em_circulacao");
  });

  test("o banco recusa destino que não é http(s) e lado que não existe", async () => {
    const js = await admin
      .from("campaigns")
      .insert({ advertiser_id: alice.advertiserId, name: "x", destination_url: "javascript:alert(1)" });
    assert.ok(js.error, "aceitou javascript:");

    const antigo = await admin
      .from("campaigns")
      .insert({ advertiser_id: alice.advertiserId, name: "x", sides: "alcance", destination_url: "https://x.com" });
    assert.ok(antigo.error, "aceitou o plano antigo");

    const semLado = await admin
      .from("campaigns")
      .insert({ advertiser_id: alice.advertiserId, name: "x", destination_url: "https://x.com" })
      .select("id, sides")
      .single();
    assert.ifError(semLado.error);
    assert.equal(semLado.data.sides, "um_lado", "sem escolha, a arte vai num lado");
    await admin.from("campaigns").delete().eq("id", semLado.data.id);
  });
});
