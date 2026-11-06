import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allApproved,
  artworkType,
  checkArtworkFile,
  cleanFileName,
  formatMoment,
  isArtworkPath,
  MAX_ARTWORK_BYTES,
  sideLabel,
  sidesOf,
  sizeLabel,
  versionsOf,
  type ArtworkRow,
} from "../../lib/artes.ts";

const CAMPAIGN = "6f1c2a8e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";

test("campanha de um lado só tem a frente, chamada de 'Arte'", () => {
  assert.deepEqual(sidesOf("um_lado"), ["frente"]);
  assert.deepEqual(sidesOf("frente_e_verso"), ["frente", "verso"]);
  assert.equal(sideLabel("frente", "um_lado"), "Arte");
  assert.equal(sideLabel("verso", "frente_e_verso"), "Verso");
});

test("tipo pelo navegador ou, se vier vazio, pela extensão", () => {
  assert.equal(artworkType({ name: "a.pdf", type: "application/pdf" }), "application/pdf");
  assert.equal(artworkType({ name: "ARTE.JPEG", type: "" }), "image/jpeg");
  assert.equal(artworkType({ name: "arte.png", type: "image/svg+xml" }), null);
  assert.equal(artworkType({ name: "arte.ai", type: "" }), null);
});

test("arquivo vazio, de outro formato ou grande demais é recusado antes de subir", () => {
  assert.equal(checkArtworkFile({ name: "a.pdf", type: "application/pdf", size: 1000 }), null);
  assert.equal(checkArtworkFile({ name: "a.pdf", type: "application/pdf", size: 0 }), "O arquivo está vazio.");
  assert.equal(checkArtworkFile({ name: "a.psd", type: "image/vnd.adobe.photoshop", size: 10 }), "Mande em PDF, PNG ou JPG.");
  assert.match(checkArtworkFile({ name: "a.png", type: "image/png", size: MAX_ARTWORK_BYTES + 1 }) ?? "", /passa de 50 MB/);
});

test("nome do arquivo sem pasta", () => {
  assert.equal(cleanFileName("C:\\fakepath\\Arte final.pdf"), "Arte final.pdf");
  assert.equal(cleanFileName("  "), "arte");
  assert.equal(cleanFileName("x".repeat(300)).length, 200);
});

test("tamanho legível", () => {
  assert.equal(sizeLabel(820 * 1024), "820 KB");
  assert.equal(sizeLabel(12.43 * 1024 * 1024), "12,4 MB");
  assert.equal(sizeLabel(10), "1 KB");
});

test("caminho do arquivo tem que ser da campanha", () => {
  const file = "0b6a3c1e-2d4f-4a5b-8c9d-0e1f2a3b4c5d.pdf";
  assert.ok(isArtworkPath(`${CAMPAIGN}/${file}`, CAMPAIGN));
  assert.ok(!isArtworkPath(`${CAMPAIGN}/${file}`, "00000000-0000-4000-8000-000000000000"));
  assert.ok(!isArtworkPath(`${CAMPAIGN}/../outra/${file}`, CAMPAIGN));
  assert.ok(!isArtworkPath(`${CAMPAIGN}/${file}.html`, CAMPAIGN));
});

function row(id: string, side: "frente" | "verso", created_at: string, status: ArtworkRow["status"] = "em_revisao"): ArtworkRow {
  return { id, side, created_at, status, file_name: "a.pdf", content_type: "application/pdf", size_bytes: 1, review_note: null, reviewed_at: null };
}

test("versões numeradas pela ordem de envio, a mais nova primeiro e só ela vale", () => {
  const rows = [
    row("b", "frente", "2026-11-06T12:00:00Z", "aprovada"),
    row("a", "frente", "2026-11-05T12:00:00Z", "ajustes"),
    row("c", "verso", "2026-11-06T13:00:00Z"),
  ];
  const frente = versionsOf(rows, "frente");
  assert.deepEqual(frente.map((v) => [v.id, v.version, v.current]), [["b", 2, true], ["a", 1, false]]);
  assert.equal(versionsOf(rows, "verso").length, 1);
  assert.ok(allApproved(rows, "um_lado"));
  assert.ok(!allApproved(rows, "frente_e_verso"));
});

test("data e hora no fuso do RJ", () => {
  assert.equal(formatMoment("2026-11-06T17:05:00Z"), "06/11/2026 às 14:05");
});
