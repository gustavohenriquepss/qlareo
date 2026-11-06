/**
 * Campanhas, QR codes e leituras: o que cada um enxerga e o que o visitante
 * anônimo consegue fazer (só ler um QR, via `record_scan`). O QR é da
 * campanha; o restaurante da campanha só guarda quantas sacolas recebeu.
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
  let aliceLink: string;
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
      .select("id, slug")
      .single();
    assert.ifError(error);
    return data as { id: string; slug: string };
  }

  async function link(campaignId: string, restaurantId: string, bags: number) {
    const { data, error } = await admin
      .from("campaign_restaurants")
      .insert({ campaign_id: campaignId, restaurant_id: restaurantId, bags })
      .select("id")
      .single();
    assert.ifError(error);
    return data.id as string;
  }

  before(async () => {
    alice = await createPerson(admin, "Loja da Alice");
    bruno = await createPerson(admin, "Oficina do Bruno");
    operador = await createPerson(admin, "Qlareo");
    people.push(alice, bruno, operador);
    await makeOperator(admin, operador);

    sharedRestaurant = await restaurant(`Restaurante ${randomUUID()}`);
    otherRestaurant = await restaurant(`Só do Bruno ${randomUUID()}`);

    const a = await campaign(alice.advertiserId, "https://alice.example/oferta");
    const b = await campaign(bruno.advertiserId, "https://bruno.example/");
    aliceCampaign = a.id;
    aliceSlug = a.slug;
    brunoCampaign = b.id;
    brunoSlug = b.slug;

    aliceLink = await link(aliceCampaign, sharedRestaurant, 600);
    await link(brunoCampaign, otherRestaurant, 400);
  });

  after(async () => {
    for (const p of people) await removePerson(admin, p);
    if (restaurantIds.length) await admin.from("restaurants").delete().in("id", restaurantIds);
  });

  test("o slug gerado é curto e sem caracteres que se confundem", () => {
    assert.match(aliceSlug, /^[a-hjkmnp-z2-9]{7}$/);
  });

  test("o restaurante da campanha não tem QR próprio", async () => {
    const { error } = await admin.from("campaign_restaurants").select("slug").limit(1);
    assert.ok(error, "campaign_restaurants ainda tem slug");
  });

  test("record_scan devolve o destino e grava a leitura", async () => {
    const anon = anonClient();
    const { data, error } = await anon.rpc("record_scan", { scan_slug: aliceSlug, visitor: visitor("v1") });
    assert.ifError(error);
    assert.equal(data, "https://alice.example/oferta");

    const scans = await admin.from("scans").select("visitor_hash").eq("campaign_id", aliceCampaign);
    assert.deepEqual(scans.data, [{ visitor_hash: visitor("v1") }]);
  });

  test("record_scan com count_it falso resolve sem gravar", async () => {
    const before = await admin.from("scans").select("id", { count: "exact", head: true }).eq("campaign_id", aliceCampaign);
    const { data } = await anonClient().rpc("record_scan", {
      scan_slug: aliceSlug.toUpperCase(),
      visitor: visitor("bot"),
      count_it: false,
    });
    assert.equal(data, "https://alice.example/oferta", "o slug não diferencia maiúscula");
    const after = await admin.from("scans").select("id", { count: "exact", head: true }).eq("campaign_id", aliceCampaign);
    assert.equal(after.count, before.count);
  });

  test("slug desconhecido devolve nulo; hash inválido não grava", async () => {
    const unknown = await anonClient().rpc("record_scan", { scan_slug: "naoexiste", visitor: visitor("x") });
    assert.equal(unknown.data, null);

    const before = await admin.from("scans").select("id", { count: "exact", head: true }).eq("campaign_id", aliceCampaign);
    await anonClient().rpc("record_scan", { scan_slug: aliceSlug, visitor: "ip-em-claro-200.1.2.3" });
    const after = await admin.from("scans").select("id", { count: "exact", head: true }).eq("campaign_id", aliceCampaign);
    assert.equal(after.count, before.count);
  });

  test("visitante anônimo não lê nenhuma tabela", async () => {
    const anon = anonClient();
    for (const table of ["restaurants", "campaigns", "campaign_restaurants", "scans"]) {
      const { data } = await anon.from(table).select("*");
      assert.ok(!data || data.length === 0, `${table} vazou para o visitante`);
    }
  });

  test("anunciante vê só as próprias campanhas, sacolas e leituras", async () => {
    const campaigns = await alice.client.from("campaigns").select("id, slug");
    assert.deepEqual(campaigns.data, [{ id: aliceCampaign, slug: aliceSlug }]);

    const links = await alice.client.from("campaign_restaurants").select("id, bags");
    assert.deepEqual(links.data, [{ id: aliceLink, bags: 600 }]);

    const brunoScan = await anonClient().rpc("record_scan", { scan_slug: brunoSlug, visitor: visitor("b1") });
    assert.ifError(brunoScan.error);
    const scans = await alice.client.from("scans").select("campaign_id");
    assert.ok(scans.data!.length > 0);
    assert.ok(scans.data!.every((s) => s.campaign_id === aliceCampaign), "Alice viu leitura do Bruno");
  });

  test("o relatório do anunciante sai numa consulta só", async () => {
    const { data, error } = await alice.client
      .from("campaigns")
      .select("id, scans(count), campaign_restaurants(bags, restaurants(name))")
      .eq("id", aliceCampaign)
      .single();
    assert.ifError(error);
    assert.ok(data.scans[0].count > 0);
    assert.equal(data.campaign_restaurants.length, 1);
    assert.equal(data.campaign_restaurants[0].bags, 600);
  });

  test("anunciante vê só os restaurantes das próprias campanhas", async () => {
    const { data } = await alice.client.from("restaurants").select("id");
    assert.deepEqual(data, [{ id: sharedRestaurant }]);
  });

  test("anunciante não cria, muda nem apaga campanha, sacolas ou leitura", async () => {
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
      .insert({ campaign_id: aliceCampaign, visitor_hash: visitor("falso") });
    assert.ok(forged.error, "anunciante inventou leitura");

    const wiped = await alice.client.from("scans").delete().eq("campaign_id", aliceCampaign).select();
    assert.ok(wiped.error || (wiped.data ?? []).length === 0, "anunciante apagou leitura");

    const inflated = await alice.client.from("campaign_restaurants").update({ bags: 99999 }).eq("id", aliceLink).select();
    assert.deepEqual(inflated.data ?? [], [], "anunciante mudou o número de sacolas");

    const newSlug = await alice.client.from("campaigns").update({ slug: "da-alice" }).eq("id", aliceCampaign).select();
    assert.deepEqual(newSlug.data ?? [], [], "anunciante trocou o QR");
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
