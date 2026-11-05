import { test } from "node:test";
import assert from "node:assert/strict";
import { clientIp, isBot, isValidSlug, safeDestination, scanDay, visitorHash } from "../../lib/scan.ts";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; SM-A146M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";

test("celular de verdade conta como leitura", () => {
  assert.equal(isBot(IPHONE), false);
  assert.equal(isBot(ANDROID), false);
});

test("prévias de link, buscadores e linha de comando não contam", () => {
  for (const ua of [
    "WhatsApp/2.24.21.80 A",
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "TelegramBot (like TwitterBot)",
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "curl/8.9.1",
    "Mozilla/5.0 HeadlessChrome/130.0.0.0",
  ]) {
    assert.equal(isBot(ua), true, ua);
  }
});

test("sem user agent não conta", () => {
  assert.equal(isBot(null), true);
  assert.equal(isBot(""), true);
});

test("o dia vira à meia-noite de Brasília, não de UTC", () => {
  // 02:30 UTC de 5/nov ainda é 23:30 de 4/nov no RJ.
  assert.equal(scanDay(new Date("2026-11-05T02:30:00Z")), "2026-11-04");
  assert.equal(scanDay(new Date("2026-11-05T03:30:00Z")), "2026-11-05");
});

test("o hash é estável no dia e muda de um dia para o outro", () => {
  const a = visitorHash("s", "2026-11-04", "200.1.2.3", IPHONE);
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(a, visitorHash("s", "2026-11-04", "200.1.2.3", IPHONE));
  assert.notEqual(a, visitorHash("s", "2026-11-05", "200.1.2.3", IPHONE));
  assert.notEqual(a, visitorHash("outro", "2026-11-04", "200.1.2.3", IPHONE));
  assert.notEqual(a, visitorHash("s", "2026-11-04", "200.1.2.4", IPHONE));
});

test("o IP é o primeiro do x-forwarded-for", () => {
  assert.equal(clientIp(new Headers({ "x-forwarded-for": "200.1.2.3, 10.0.0.1" })), "200.1.2.3");
  assert.equal(clientIp(new Headers({ "x-real-ip": "200.9.9.9" })), "200.9.9.9");
  assert.equal(clientIp(new Headers()), "0.0.0.0");
});

test("o destino só pode ser http(s)", () => {
  assert.equal(safeDestination("https://wa.me/5521999999999")?.href, "https://wa.me/5521999999999");
  assert.equal(safeDestination("http://exemplo.com.br/")?.href, "http://exemplo.com.br/");
  for (const bad of ["javascript:alert(1)", "data:text/html,oi", "ftp://x.com", "não é url", "", null]) {
    assert.equal(safeDestination(bad), null, String(bad));
  }
});

test("slug fora do formato nem vai ao banco", () => {
  assert.equal(isValidSlug("pex7k2a"), true);
  assert.equal(isValidSlug("padaria-centro"), true);
  for (const bad of ["ab", "a/b", "x".repeat(41), "../etc", "a b"]) {
    assert.equal(isValidSlug(bad), false, bad);
  }
});
