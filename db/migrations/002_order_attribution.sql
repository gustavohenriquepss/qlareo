-- 002_order_attribution.sql — de ONDE veio a venda.
-- -----------------------------------------------------------------------------
-- Cinco colunas em `orders`, todas vindas do MESMO Get Order que já traz os
-- itens: endereço de entrega (relatório por região) e atribuição de marketing
-- (relatório de cupons e origem). Nenhuma request nova por pedido.
--
-- Todas anuláveis, e a ausência é AMBÍGUA de propósito — pode ser "o pedido não
-- tem" (compra sem cupom, produto digital sem endereço) ou "ainda não
-- sincronizado". Quem relata distingue os dois; o schema não tenta.
-- -----------------------------------------------------------------------------

ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_state TEXT;  -- UF ('SP')
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_city  TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon         TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS utm_source     TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS utm_campaign   TEXT;

-- O relatório por região agrupa por UF dentro de uma janela de data; este índice
-- cobre esse padrão. Cidade não ganha índice: é alta cardinalidade e só aparece
-- como detalhe dentro de uma UF já filtrada.
CREATE INDEX IF NOT EXISTS orders_shipping_state_idx
  ON orders (store_account, shipping_state);

-- -----------------------------------------------------------------------------
-- REBAIXA `items_synced` DE TODO PEDIDO JÁ SINCRONIZADO. Leia antes de aplicar.
--
-- Um pedido gravado por uma versão anterior tem `items_synced = TRUE` e as cinco
-- colunas acima em NULL — o detalhe FOI buscado, mas por um código que ainda não
-- sabia ler estes campos. Sem este UPDATE, os relatórios novos leriam esse
-- pedido como "sincronizado, e realmente sem UF nem cupom", e reportariam 100%
-- do faturamento em "sem região" com cara de dado, não de lacuna.
--
-- Como o sinal de "detalhe completo" é este booleano, a única forma honesta de
-- dizer "o que foi buscado não serve mais" é rebaixá-lo. O custo é real e é
-- assumido: até rodar o sync com --items de novo, os relatórios de item
-- (produtos, SKUs, promoções) e os dois novos respondem "não sincronizado" em
-- vez de números — que é a resposta correta, e não a mais agradável.
--
--   npm run sync -- --from=... --to=... --items
--
-- Idempotente na prática: rodar de novo depois do re-sync rebaixaria tudo outra
-- vez, então esta migration NÃO deve ser reaplicada num banco já migrado. O
-- runner (scripts/migrate.ts) controla isso.
-- -----------------------------------------------------------------------------
UPDATE orders SET items_synced = FALSE WHERE items_synced = TRUE;
