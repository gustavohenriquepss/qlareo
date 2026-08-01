-- 004_vtex_accounts.sql — a ponte entre uma org e a loja VTEX que ela representa.
-- -----------------------------------------------------------------------------
-- Tabela separada, NÃO coluna em `organizations`. O 1:1 é uma constraint, não
-- uma forma: relaxar para "uma org, várias contas" no futuro é `DROP CONSTRAINT`
-- numa migration de segundos, sem tocar em nenhuma linha. Se fosse coluna, seria
-- extrair tabela e migrar dados.
--
-- É por isso que a PK é um `id` próprio e não `org_id`: com `org_id` como PK, o
-- 1:1 estaria na chave primária, e afrouxá-lo exigiria trocar a PK — de novo uma
-- migration de dados. A constraint que se pretende remover um dia não pode ser a
-- chave.
--
-- CREDENCIAL: as colunas cifradas nascem NULL e só são preenchidas na Fase 4
-- (ver docs/adr/0003-chave-de-criptografia.md). Nada de appKey/appToken em claro
-- aqui, em nenhuma hipótese.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS vtex_accounts (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID        NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,

  -- `account_name` é EXATAMENTE o valor gravado em `orders.store_account`,
  -- `order_items.store_account` e `sync_state.store_account`. Não é um id novo
  -- nem uma tradução: é a mesma string, o nome da conta na VTEX. Toda a
  -- refatoração multi-tenant se apoia nisso — é o que dispensa backfill.
  account_name  TEXT        NOT NULL,

  -- Espelha VTEX_ENVIRONMENT. NULL = default (vtexcommercestable.com.br).
  environment   TEXT,

  -- Envelope encryption (ADR 0003). AES-256-GCM local, com IV e tag embutidos no
  -- ciphertext; a DEK de cada conta viaja embrulhada pela KEK do KMS.
  app_key_ciphertext    BYTEA,
  app_token_ciphertext  BYTEA,
  dek_wrapped           BYTEA,
  kek_alias             TEXT,
  key_version           INT,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- ---------------------------------------------------------------------------
  -- O 1:1. DROPAR ESTA CONSTRAINT é o caminho oficial para 1:N — nada mais
  -- precisa mudar, porque `id` já é a chave e as leituras já podem devolver N.
  -- ---------------------------------------------------------------------------
  CONSTRAINT vtex_accounts_org_unico UNIQUE (org_id),

  -- Uma conta VTEX pertence a UMA org. Global, não por org: sem isso, duas orgs
  -- poderiam apontar para a mesma loja e cada uma leria os pedidos da outra —
  -- vazamento entre tenants por dado, que nenhum RLS pegaria, porque as duas
  -- estariam legitimamente autorizadas ao mesmo `store_account`.
  CONSTRAINT vtex_accounts_conta_unica UNIQUE (account_name),

  -- Credencial é tudo-ou-nada. O estado meio-preenchido perigoso é ter
  -- ciphertext sem `dek_wrapped`: o cofre sem a chave do cofre, ou seja, a
  -- credencial perdida sem ninguém perceber até o próximo sync falhar.
  -- Rotação continua válida (re-embrulhar mexe em `dek_wrapped` e
  -- `key_version`, ambos seguem NOT NULL).
  CONSTRAINT vtex_accounts_credencial_completa CHECK (
    (
      app_key_ciphertext   IS NULL AND
      app_token_ciphertext IS NULL AND
      dek_wrapped          IS NULL AND
      kek_alias            IS NULL AND
      key_version          IS NULL
    ) OR (
      app_key_ciphertext   IS NOT NULL AND
      app_token_ciphertext IS NOT NULL AND
      dek_wrapped          IS NOT NULL AND
      kek_alias            IS NOT NULL AND
      key_version          IS NOT NULL
    )
  )
);

-- -----------------------------------------------------------------------------
-- DECISÃO: NÃO existe FK de `orders.store_account` para
-- `vtex_accounts.account_name`. (Critério de aceite da GUS-53 pedia decidir e
-- registrar o porquê.)
--
-- O que se ganharia: a cascata da 1.5 de graça — apagar a org levaria org ->
-- vtex_accounts -> orders -> order_items numa instrução só. E integridade: sem
-- pedido órfão de uma conta que ninguém possui.
--
-- Por que não, mesmo assim:
--
-- 1. A cascata implícita é a forma ERRADA da operação que a 1.5 precisa. Apagar
--    uma org com histórico grande viraria um DELETE de milhões de linhas dentro
--    de uma transação, segurando lock e inchando WAL, disparado por um
--    `DELETE FROM organizations` que na tela parece uma linha só. A 1.5 quer o
--    oposto: apagar em lotes, registrar o que foi apagado, e ser retomável.
--    Ter a cascata "de graça" convidaria a não escrever isso.
--
-- 2. Passaria a exigir que a linha de `vtex_accounts` exista ANTES do primeiro
--    upsert de pedido. Hoje `npm run seed` e `npm run sync` inventam um
--    `store_account` e gravam. Como o Qlareo roda sempre com credencial de
--    cliente, o caminho de seed é o único ambiente de teste que controlamos —
--    quebrá-lo custa mais do que a integridade ganha.
--
-- 3. Reintroduziria o acoplamento que o desenho recusou. `store_account` é um
--    discriminador simples de propósito; foi essa simplicidade que evitou
--    backfill e reconstrução de índice. Amarrá-lo às tabelas de tenancy devolve
--    parte desse custo.
--
-- O buraco que isso deixa — pedido órfão — é coberto de outro jeito: a 1.3 faz
-- `store_account` vir sempre da sessão (nunca da requisição), a 1.4 põe RLS por
-- cima, e a 1.7 checa a consistência. Órfão vira invisível, não impossível.
--
-- Se um dia a integridade referencial pesar mais que os três pontos acima, o
-- caminho é ADICIONAR a FK numa migration própria, com NOT VALID + VALIDATE
-- CONSTRAINT para não travar a tabela.
-- -----------------------------------------------------------------------------
