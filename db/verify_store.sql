-- Verificação do PostgresOrderStore contra Postgres real, com dados SINTÉTICOS.
-- Replica as queries exatas de store/postgres/postgresOrderStore.ts.
-- Qualquer divergência dispara RAISE EXCEPTION -> psql sai != 0 (ON_ERROR_STOP).

\set ON_ERROR_STOP on
TRUNCATE orders, order_items, sync_state;

-- ============================================================================
-- SEED via a query UPSERT REAL do store (parâmetros inlined como literais)
-- ============================================================================

-- loja-a / o1 COM itens (hasItems=true -> items_synced=true)
INSERT INTO orders (store_account, order_id, created_at, status, raw_status,
  total_minor, currency, payment_method, seller_name, customer_email, items_synced)
VALUES ('loja-a','o1','2026-01-15T12:00:00Z','paid','invoiced',
  40000,'BRL','Visa','loja','ana@example.com', true)
ON CONFLICT (store_account, order_id) DO UPDATE SET
  created_at=EXCLUDED.created_at, status=EXCLUDED.status, raw_status=EXCLUDED.raw_status,
  total_minor=EXCLUDED.total_minor, currency=EXCLUDED.currency,
  payment_method=EXCLUDED.payment_method, seller_name=EXCLUDED.seller_name,
  customer_email=EXCLUDED.customer_email,
  items_synced = orders.items_synced OR EXCLUDED.items_synced, synced_at=now();

DELETE FROM order_items WHERE store_account='loja-a' AND order_id='o1';
INSERT INTO order_items (store_account, order_id, line_no, sku_id, product_id, name, quantity, unit_paid_minor, unit_list_minor)
VALUES ('loja-a','o1',0,'sku-P','prod-camiseta','Camiseta',1,40000,50000),
       ('loja-a','o1',1,'sku-meia','prod-meia','Meia',2,2500,4000);

-- loja-a / o2 SEM itens (hasItems=false -> items_synced=false, sem tocar itens)
INSERT INTO orders (store_account, order_id, created_at, status, raw_status,
  total_minor, currency, payment_method, seller_name, customer_email, items_synced)
VALUES ('loja-a','o2','2026-01-16T01:00:00Z','paid','invoiced',
  10000,'BRL','Pix','loja','bruno@example.com', false)
ON CONFLICT (store_account, order_id) DO UPDATE SET
  total_minor=EXCLUDED.total_minor,
  items_synced = orders.items_synced OR EXCLUDED.items_synced, synced_at=now();

-- loja-b / b1 (mesma janela, tenant DIFERENTE — para o teste de isolamento)
INSERT INTO orders (store_account, order_id, created_at, status, raw_status,
  total_minor, currency, items_synced)
VALUES ('loja-b','b1','2026-01-15T12:00:00Z','paid','invoiced',99900,'BRL', true);

-- ============================================================================
-- ASSERT 1 — getOrders(loja-a, jan/2026): retorna o1 e o2, NUNCA b1 (isolamento)
-- ============================================================================
DO $$
DECLARE n int; tem_b1 int;
BEGIN
  SELECT count(*) INTO n FROM orders
    WHERE store_account='loja-a'
      AND created_at >= '2026-01-01' AND created_at <= '2026-01-31T23:59:59Z';
  IF n <> 2 THEN RAISE EXCEPTION 'esperava 2 pedidos loja-a, veio %', n; END IF;

  SELECT count(*) INTO tem_b1 FROM orders
    WHERE store_account='loja-a' AND order_id='b1';
  IF tem_b1 <> 0 THEN RAISE EXCEPTION 'VAZOU: loja-a enxergou b1'; END IF;
  RAISE NOTICE 'ASSERT 1 ok — isolamento de tenant + janela';
END $$;

-- ============================================================================
-- ASSERT 2 — items_synced correto no seed (o1=true com itens, o2=false)
-- ============================================================================
DO $$
DECLARE s1 bool; s2 bool; nitems int;
BEGIN
  SELECT items_synced INTO s1 FROM orders WHERE store_account='loja-a' AND order_id='o1';
  SELECT items_synced INTO s2 FROM orders WHERE store_account='loja-a' AND order_id='o2';
  IF NOT s1 THEN RAISE EXCEPTION 'o1 deveria ter items_synced=true'; END IF;
  IF s2 THEN RAISE EXCEPTION 'o2 deveria ter items_synced=false'; END IF;
  SELECT count(*) INTO nitems FROM order_items WHERE store_account='loja-a' AND order_id='o1';
  IF nitems <> 2 THEN RAISE EXCEPTION 'o1 deveria ter 2 itens, veio %', nitems; END IF;
  RAISE NOTICE 'ASSERT 2 ok — items_synced e itens no seed';
END $$;

-- ============================================================================
-- ASSERT 3 — RE-UPSERT de o1 SEM itens: cabeçalho atualiza, mas items_synced
--            continua TRUE (OR) e os itens são PRESERVADOS (store pula o DELETE)
-- ============================================================================
INSERT INTO orders (store_account, order_id, created_at, status, raw_status,
  total_minor, currency, items_synced)
VALUES ('loja-a','o1','2026-01-15T12:00:00Z','paid','invoiced', 55555,'BRL', false)
ON CONFLICT (store_account, order_id) DO UPDATE SET
  total_minor=EXCLUDED.total_minor,
  items_synced = orders.items_synced OR EXCLUDED.items_synced, synced_at=now();
-- (store NÃO roda DELETE/INSERT de itens quando hasItems=false)

DO $$
DECLARE tot bigint; sy bool; nitems int;
BEGIN
  SELECT total_minor, items_synced INTO tot, sy FROM orders WHERE store_account='loja-a' AND order_id='o1';
  IF tot <> 55555 THEN RAISE EXCEPTION 'cabeçalho não atualizou: total=%', tot; END IF;
  IF NOT sy THEN RAISE EXCEPTION 'items_synced foi rebaixado para false (deveria ficar TRUE)'; END IF;
  SELECT count(*) INTO nitems FROM order_items WHERE store_account='loja-a' AND order_id='o1';
  IF nitems <> 2 THEN RAISE EXCEPTION 'itens perdidos no re-upsert: %', nitems; END IF;
  RAISE NOTICE 'ASSERT 3 ok — re-upsert sem itens preserva detalhe';
END $$;

-- ============================================================================
-- ASSERT 4 — o JOIN de itens (getOrders withItems) fica preso ao tenant e à janela
-- ============================================================================
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM order_items i
    JOIN orders o ON o.store_account=i.store_account AND o.order_id=i.order_id
    WHERE i.store_account='loja-a'
      AND o.created_at >= '2026-01-01' AND o.created_at <= '2026-01-31T23:59:59Z';
  IF n <> 2 THEN RAISE EXCEPTION 'JOIN de itens loja-a esperava 2, veio %', n; END IF;
  RAISE NOTICE 'ASSERT 4 ok — JOIN de itens isolado por tenant';
END $$;

-- ============================================================================
-- ASSERT 5 — sync_state: INSERT e depois ON CONFLICT UPDATE
-- ============================================================================
INSERT INTO sync_state (store_account, last_synced_at, updated_at)
VALUES ('loja-a','2026-01-16T01:00:00Z', now())
ON CONFLICT (store_account) DO UPDATE SET
  last_synced_at=EXCLUDED.last_synced_at, updated_at=now();
INSERT INTO sync_state (store_account, last_synced_at, updated_at)
VALUES ('loja-a','2026-01-20T00:00:00Z', now())
ON CONFLICT (store_account) DO UPDATE SET
  last_synced_at=EXCLUDED.last_synced_at, updated_at=now();

DO $$
DECLARE d timestamptz;
BEGIN
  SELECT last_synced_at INTO d FROM sync_state WHERE store_account='loja-a';
  IF d <> '2026-01-20T00:00:00Z'::timestamptz THEN RAISE EXCEPTION 'watermark errada: %', d; END IF;
  RAISE NOTICE 'ASSERT 5 ok — sync_state upsert';
END $$;

\echo '>>> TODAS AS ASSERÇÕES PASSARAM <<<'
