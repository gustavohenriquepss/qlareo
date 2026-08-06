-- 003_multi_tenant.sql — identidade e associação (quem é quem, e de qual loja).
-- -----------------------------------------------------------------------------
-- Três tabelas novas. NENHUMA tabela de dados é tocada: `orders`, `order_items`
-- e `sync_state` seguem com `store_account` como discriminador, que já está na
-- primeira posição das PKs e dos índices desde a 001. Esse é o motivo de a
-- refatoração multi-tenant não ter migration de dados.
--
-- A ponte entre uma org e o `store_account` das tabelas de dados é
-- `vtex_accounts`, que vem na migration seguinte (GUS-53) — é lá que mora o 1:1
-- por constraint. Aqui não há nenhuma referência a `store_account` de propósito:
-- separar as duas migrations mantém esta reversível sem tocar em dado de pedido.
--
-- Identidade (senha, recuperação, verificação de e-mail, sessão) fica INTEIRA no
-- Clerk — ver docs/adr/0001-auth-provider.md. Esta tabela `users` guarda só a
-- chave estrangeira local para o usuário do provider.
-- -----------------------------------------------------------------------------

-- Uma org = uma loja. `onboarding_completed`/`onboarding_step` ficam para a 3.3,
-- que é quem sabe quais são os passos.
CREATE TABLE IF NOT EXISTS organizations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- `clerk_user_id` é a identidade externa; `id` é a nossa.
--
-- Por que não usar o id do Clerk direto como PK: `memberships` precisa de FK
-- real com ON DELETE CASCADE (a cascata de offboarding da 1.5), e uma FK só
-- existe contra uma tabela nossa. Guardar o id do provider numa coluna UNIQUE dá
-- as duas coisas — o join com o provider e a integridade referencial local.
--
-- Sem cópia de e-mail ou nome aqui: seriam um segundo lugar onde a mesma verdade
-- mora, envelhecendo em silêncio a cada troca de e-mail feita no Clerk. Se uma
-- tela precisar listar membros sem chamar o provider, isso vira uma decisão
-- explícita de cache na 3.1, com invalidação por webhook — não um efeito
-- colateral do schema.
CREATE TABLE IF NOT EXISTS users (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id  TEXT        NOT NULL UNIQUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- N por usuário e N por org: é o que permite agência (um usuário, várias lojas)
-- e time (uma loja, vários usuários). A PK composta impede apenas o par
-- repetido — nunca o segundo vínculo do mesmo usuário com OUTRA org.
--
-- `role` como CHECK e não como ENUM: acrescentar um papel vira uma linha de
-- ALTER ... DROP/ADD CONSTRAINT numa migration comum, sem o cuidado extra que
-- ALTER TYPE pede.
CREATE TABLE IF NOT EXISTS memberships (
  user_id     UUID        NOT NULL REFERENCES users (id)         ON DELETE CASCADE,
  org_id      UUID        NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  role        TEXT        NOT NULL CHECK (role IN ('owner', 'admin', 'viewer')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, org_id)
);

-- A PK (user_id, org_id) já cobre "de quais orgs este usuário participa", que é
-- a consulta do caminho quente (resolver a org da sessão). A de trás — "quem são
-- os membros desta org" — não é coberta por ela, e é a que a tela de time e a
-- cascata por org fazem.
CREATE INDEX IF NOT EXISTS memberships_org_idx ON memberships (org_id);
