import { test } from "node:test";
import assert from "node:assert/strict";
import { fileSlug, normalizeDestination, parseCampaign, parseRestaurant, periodLabel, SIDES_LABEL } from "../../lib/campanhas.ts";

const ADVERTISER = "6f1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";

function form(values: Record<string, string>) {
  return { get: (name: string) => values[name] ?? null };
}

const base = {
  advertiser_id: ADVERTISER,
  name: "Black Friday",
  sides: "um_lado",
  destination_url: "https://padaria.example/oferta",
};

test("link colado sem https ganha https", () => {
  assert.equal(normalizeDestination("wa.me/5521999999999?text=Oi"), "https://wa.me/5521999999999?text=Oi");
  assert.equal(normalizeDestination("  https://exemplo.com.br  "), "https://exemplo.com.br/");
});

test("destino que não é site é recusado", () => {
  for (const bad of ["javascript:alert(1)", "data:text/html,oi", "ftp://x.com/a", "mailto:a@b.com", "localhost", "não é link", ""]) {
    assert.equal(normalizeDestination(bad), null, bad);
  }
});

test("a arte vai num lado ou nos dois, e mais nada", () => {
  const dois = parseCampaign(form({ ...base, sides: "frente_e_verso" }));
  assert.ok(dois.ok);
  assert.equal(dois.data.sides, "frente_e_verso");

  for (const bad of ["", "impacto", "alcance", "verso"]) {
    const parsed = parseCampaign(form({ ...base, sides: bad }));
    assert.ok(!parsed.ok, bad);
    assert.ok(parsed.fields.sides, bad);
  }
});

test("datas: opcionais, válidas e na ordem", () => {
  const sem = parseCampaign(form(base));
  assert.ok(sem.ok);
  assert.equal(sem.data.starts_on, null);

  const invertida = parseCampaign(form({ ...base, starts_on: "2026-12-10", ends_on: "2026-12-01" }));
  assert.ok(!invertida.ok);
  assert.ok(invertida.fields.ends_on);

  const impossivel = parseCampaign(form({ ...base, starts_on: "2026-02-30" }));
  assert.ok(!impossivel.ok);
  assert.ok(impossivel.fields.starts_on);
});

test("erro devolve o que foi digitado", () => {
  const parsed = parseCampaign(form({ ...base, name: "", destination_url: "javascript:x" }));
  assert.ok(!parsed.ok);
  assert.equal(parsed.values.destination_url, "javascript:x");
  assert.ok(parsed.fields.name && parsed.fields.destination_url);
});

test("a edição exige status válido", () => {
  assert.ok(!parseCampaign(form(base), { withStatus: true }).ok);
  const ok = parseCampaign(form({ ...base, status: "em_circulacao" }), { withStatus: true });
  assert.ok(ok.ok);
  assert.equal(ok.data.status, "em_circulacao");
});

test("restaurante: nome e cidade obrigatórios, bairro opcional", () => {
  const vazio = parseRestaurant(form({}));
  assert.ok(!vazio.ok);
  assert.deepEqual(Object.keys(vazio.fields).sort(), ["city", "name"]);

  const ok = parseRestaurant(form({ name: " Cantina ", city: "Itaboraí", neighborhood: "" }));
  assert.ok(ok.ok);
  assert.deepEqual(ok.data, { name: "Cantina", city: "Itaboraí", neighborhood: null });
});

test("rótulos", () => {
  assert.equal(SIDES_LABEL.um_lado, "Um lado");
  assert.equal(SIDES_LABEL.frente_e_verso, "Frente e verso");
  assert.equal(periodLabel("2026-11-05", "2026-12-05"), "05/11/2026 a 05/12/2026");
  assert.equal(periodLabel(null, null), "Sem datas");
});

test("nome de arquivo da gráfica é ASCII", () => {
  assert.equal(fileSlug("Padaria São João", "Cantina da Praça", "pex7k2a"), "padaria-sao-joao-cantina-da-praca-pex7k2a");
});
