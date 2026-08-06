-- 005_rls.sql — Row Level Security como DEFESA EM PROFUNDIDADE.
-- -----------------------------------------------------------------------------
-- LEIA ISTO ANTES DE CONFIAR NESTE ARQUIVO.
--
-- RLS aqui é a SEGUNDA tranca, não a primeira. O `WHERE store_account = $1`
-- explícito de `postgresOrderStore.ts` continua obrigatório em toda query, e
-- continua sendo o mecanismo principal. Esta migration existe para o dia em que
-- alguém escrever uma query nova e esquecer o WHERE: em vez de vazar a loja
-- inteira, ela devolve zero linhas.
--
-- Quem trata RLS como mecanismo principal acaba com queries sem filtro no código
-- e um único `SET` errado entre elas e o vazamento. A ordem importa: filtro
-- explícito primeiro, RLS por baixo.
--
-- -----------------------------------------------------------------------------
-- COMO O ISOLAMENTO ACONTECE
--
-- A aplicação declara em qual loja está, por transação:
--
--     SELECT set_config('qlareo.store_account', $1, true)   -- true = LOCAL
--
-- e não `SET LOCAL qlareo.store_account = $1`: comandos SET não aceitam
-- parâmetro de bind, e montar o SET por concatenação colocaria um valor vindo de
-- fora dentro do texto do comando. `set_config` recebe o valor parametrizado.
--
-- O terceiro argumento `true` prende o ajuste à transação. Fora de transação ele
-- vazaria para a próxima requisição que pegasse a mesma conexão do pool — dois
-- lojistas, uma conexão reciclada, e o segundo lê os dados do primeiro. É por
-- isso que TODA leitura passou a abrir transação em `postgresOrderStore.ts`.
--
-- `current_setting(..., true)` (missing_ok) devolve NULL quando ninguém definiu
-- o valor. `store_account = NULL` não é verdadeiro, então a policy nega. Falha
-- fechada: esquecer de declarar a loja não devolve tudo, devolve nada.
--
-- -----------------------------------------------------------------------------
-- POR QUE AS MIGRATIONS CONTINUAM RODANDO
--
-- `ENABLE ROW LEVEL SECURITY` (sem `FORCE`) não se aplica ao DONO da tabela. O
-- role que roda `npm run migrate` é o dono; o role da aplicação não é. É essa
-- assimetria — e não uma exceção escrita à mão — que mantém migrations,
-- backfill e manutenção funcionando enquanto a app fica sujeita à policy.
--
-- Consequência a NÃO esquecer: se a app um dia conectar com o role dono, a RLS
-- some silenciosamente. O teste de RLS existe para isso doer cedo.
-- -----------------------------------------------------------------------------

-- Role de PRIVILÉGIO, sem LOGIN e sem senha — senha não entra em migration
-- versionada. O usuário de login é criado no provisionamento, fora daqui, e
-- recebe estes privilégios com:
--
--     CREATE ROLE qlareo_web LOGIN PASSWORD '...';   -- fora do repo
--     GRANT qlareo_app TO qlareo_web;
--
-- Sem SUPERUSER e sem BYPASSRLS, que são os dois atributos que anulariam tudo
-- isto. O default de CREATE ROLE já é NOSUPERUSER NOBYPASSRLS; explicitamos
-- porque aqui o default é a decisão.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'qlareo_app') THEN
    CREATE ROLE qlareo_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO qlareo_app;

-- Tabelas de dados: a app lê e escreve, sempre sob policy.
GRANT SELECT, INSERT, UPDATE, DELETE ON orders      TO qlareo_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON order_items TO qlareo_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON sync_state  TO qlareo_app;

-- Tabelas de tenancy: só leitura por enquanto. `resolveTenant` precisa do JOIN
-- memberships ⋈ vtex_accounts. Escrita (onboarding, convite de membro) entra
-- quando as Fases 3 e 4 existirem — e aí com o GRANT mínimo de cada caso, não
-- um ALL antecipado.
GRANT SELECT ON organizations TO qlareo_app;
GRANT SELECT ON users         TO qlareo_app;
GRANT SELECT ON memberships   TO qlareo_app;
GRANT SELECT ON vtex_accounts TO qlareo_app;

-- Sequences: nenhuma tabela usa serial/identity (todas as PKs são UUID com
-- gen_random_uuid() ou chave natural), então não há GRANT de sequence a fazer.

-- -----------------------------------------------------------------------------
-- Policies. Uma por tabela, cobrindo leitura e escrita.
--
-- `USING` filtra o que a app ENXERGA; `WITH CHECK` barra o que ela GRAVA. Sem o
-- WITH CHECK, um INSERT poderia criar linha de outra loja — invisível para quem
-- inseriu, e perfeitamente visível para a vítima.
-- -----------------------------------------------------------------------------

ALTER TABLE orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_state  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS orders_tenant      ON orders;
DROP POLICY IF EXISTS order_items_tenant ON order_items;
DROP POLICY IF EXISTS sync_state_tenant  ON sync_state;

CREATE POLICY orders_tenant ON orders
  USING      (store_account = current_setting('qlareo.store_account', true))
  WITH CHECK (store_account = current_setting('qlareo.store_account', true));

CREATE POLICY order_items_tenant ON order_items
  USING      (store_account = current_setting('qlareo.store_account', true))
  WITH CHECK (store_account = current_setting('qlareo.store_account', true));

CREATE POLICY sync_state_tenant ON sync_state
  USING      (store_account = current_setting('qlareo.store_account', true))
  WITH CHECK (store_account = current_setting('qlareo.store_account', true));
