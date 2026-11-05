import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNext } from "../../lib/site.ts";

test("safeNext aceita caminho interno", () => {
  assert.equal(safeNext("/painel/campanhas?x=1"), "/painel/campanhas?x=1");
});

test("safeNext recusa o que levaria para fora do app", () => {
  // `/\evil.com`: o navegador trata `\` como `/`, então isto também sai do site.
  const backslash = String.raw`/\evil.com`;
  for (const evil of ["https://evil.com", "//evil.com", backslash, "evil.com", "javascript:alert(1)"]) {
    assert.equal(safeNext(evil), "/painel", evil);
  }
});

test("safeNext cai no padrão sem valor", () => {
  assert.equal(safeNext(null), "/painel");
  assert.equal(safeNext(undefined, "/entrar"), "/entrar");
});
