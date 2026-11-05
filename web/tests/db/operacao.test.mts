/**
 * Área do operador: a lista de anunciantes com e-mail só abre para operador, e
 * o QR sem leitura é o único que sai da campanha.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { adminClient, anonClient, createPerson, makeOperator, removePerson, skip, type Person } from "./helpers.mts";

describe("área do operador", { skip }, () => {
  const admin = skip ? (null as never) : adminClient();
  let alice: Person;
  let operador: Person;

  before(async () => {
    alice = await createPerson(admin, "Loja da Alice");
    operador = await createPerson(admin, "Qlareo");
    await makeOperator(admin, operador);
  });

  after(async () => {
    for (const p of [alice, operador]) if (p) await removePerson(admin, p);
  });

  test("operador vê os anunciantes com o e-mail de quem tem acesso", async () => {
    const { data, error } = await operador.client.rpc("operator_advertisers");
    assert.ifError(error);
    const row = data.find((r: { id: string }) => r.id === alice.advertiserId);
    assert.ok(row, "anunciante da Alice não apareceu");
    assert.deepEqual(row.member_emails, [alice.email]);
    assert.equal(row.campaign_count, 0);
  });

  test("conta comum não enxerga e-mail de ninguém", async () => {
    const { data, error } = await alice.client.rpc("operator_advertisers");
    assert.ifError(error);
    assert.deepEqual(data, []);
  });

  test("visitante anônimo não chama a função", async () => {
    const { data, error } = await anonClient().rpc("operator_advertisers");
    assert.ok(error || (data ?? []).length === 0, "anônimo leu a lista de anunciantes");
  });

  test("operador cadastra restaurante e liga à campanha; anunciante não", async () => {
    const restaurant = await operador.client
      .from("restaurants")
      .insert({ name: "Teste do operador", city: "Niterói", neighborhood: "Icaraí" })
      .select("id")
      .single();
    assert.ifError(restaurant.error);

    const campaign = await operador.client
      .from("campaigns")
      .insert({
        advertiser_id: alice.advertiserId,
        name: "Campanha do operador",
        plan: "alcance",
        side: "verso",
        destination_url: "https://alice.example/",
      })
      .select("id")
      .single();
    assert.ifError(campaign.error);

    const qr = await operador.client
      .from("campaign_restaurants")
      .insert({ campaign_id: campaign.data.id, restaurant_id: restaurant.data.id })
      .select("id, slug")
      .single();
    assert.ifError(qr.error);

    const sneaky = await alice.client
      .from("campaign_restaurants")
      .insert({ campaign_id: campaign.data.id, restaurant_id: restaurant.data.id, slug: "da-alice" });
    assert.ok(sneaky.error, "anunciante criou QR");

    const renamed = await alice.client
      .from("restaurants")
      .update({ name: "Restaurante da Alice" })
      .eq("id", restaurant.data.id)
      .select();
    assert.deepEqual(renamed.data ?? [], [], "anunciante renomeou restaurante");

    await admin.from("campaigns").delete().eq("id", campaign.data.id);
    await admin.from("restaurants").delete().eq("id", restaurant.data.id);
  });
});
