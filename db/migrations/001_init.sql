-- 001_init.sql — schema inicial do QLAREO.
-- -----------------------------------------------------------------------------
-- Guarda pedidos canônicos (o mesmo modelo de core/types.ts) para que os
-- relatórios leiam do banco local, sem os tetos da Orders API (3.000/consulta,
-- ~24 meses). Dinheiro em BIGINT de unidade mínima (centavos) — a invariante do
-- core: inteiro sempre, decimal só na exibição.
--
-- `store_account` em toda tabela e nas PKs deixa multi-tenant a um passo, sem
-- pagar o custo agora (o MVP é single-tenant, uma conta por processo).
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS orders (
  store_account   TEXT        NOT NULL,
  order_id        TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL,                 -- UTC, como vem da API
  status          TEXT        NOT NULL,                 -- canônico: paid/canceled/pending/refunded
  raw_status      TEXT        NOT NULL,                 -- status original da plataforma
  total_minor     BIGINT      NOT NULL,                 -- centavos (unidade mínima inteira)
  currency        TEXT        NOT NULL,
  payment_method  TEXT,
  seller_name     TEXT,
  customer_email  TEXT,
  items_synced    BOOLEAN     NOT NULL DEFAULT FALSE,   -- detalhe de item já buscado?
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (store_account, order_id)
);

-- O relatório de vendas filtra por janela de data e por status; estes índices
-- cobrem os dois padrões de leitura.
CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders (store_account, created_at);
CREATE INDEX IF NOT EXISTS orders_status_idx     ON orders (store_account, status);

CREATE TABLE IF NOT EXISTS order_items (
  store_account    TEXT   NOT NULL,
  order_id         TEXT   NOT NULL,
  line_no          INT    NOT NULL,                     -- posição no pedido (item não tem id estável)
  sku_id           TEXT   NOT NULL,
  product_id       TEXT   NOT NULL,                     -- relatórios de produto agrupam por aqui
  name             TEXT   NOT NULL,
  quantity         INT    NOT NULL,
  unit_paid_minor  BIGINT NOT NULL,                     -- preço pago por unidade, centavos
  unit_list_minor  BIGINT,                              -- preço "de", centavos (NULL = sem desconto)
  PRIMARY KEY (store_account, order_id, line_no),
  FOREIGN KEY (store_account, order_id)
    REFERENCES orders (store_account, order_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS order_items_product_idx ON order_items (store_account, product_id);

-- Marca d'água do sync incremental por loja: até quando já puxamos.
CREATE TABLE IF NOT EXISTS sync_state (
  store_account   TEXT PRIMARY KEY,
  last_synced_at  TIMESTAMPTZ,                          -- maior created_at já sincronizado
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
