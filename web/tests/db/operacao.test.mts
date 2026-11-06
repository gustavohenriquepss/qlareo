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

  test("operador cadastra restaurante, liga à campanha e anota sacolas; anunciante não", async () => {
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
        sides: "frente_e_verso",
        destination_url: "https://alice.example/",
      })
      .select("id, slug")
      .single();
    assert.ifError(campaign.error);
    assert.ok(campaign.data.slug, "campanha nasceu sem QR");

    const link = await operador.client
      .from("campaign_restaurants")
      .insert({ campaign_id: campaign.data.id, restaurant_id: restaurant.data.id })
      .select("id, bags")
      .single();
    assert.ifError(link.error);
    assert.equal(link.data.bags, 0, "restaurante entra com zero sacolas");

    const noted = await operador.client
      .from("campaign_restaurants")
      .update({ bags: 750 })
      .eq("id", link.data.id)
      .select("bags")
      .single();
    assert.ifError(noted.error);
    assert.equal(noted.data.bags, 750);

    const negative = await operador.client.from("campaign_restaurants").update({ bags: -1 }).eq("id", link.data.id);
    assert.ok(negative.error, "aceitou sacola negativa");

    const sneaky = await alice.client
      .from("campaign_restaurants")
      .insert({ campaign_id: campaign.data.id, restaurant_id: restaurant.data.id, bags: 10 });
    assert.ok(sneaky.error, "anunciante ligou restaurante");

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
