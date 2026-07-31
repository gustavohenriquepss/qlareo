# ADR 0001 — Provider de autenticação: Supabase Auth vs Clerk

- **Status:** aceito
- **Data:** 2026-07-31
- **Issue:** [GUS-49](https://linear.app/padeiro/issue/GUS-49/01-adr-supabase-auth-vs-clerk)
- **Bloqueia:** GUS-52 (1.1, schema de `users`) e toda a Fase 3 (GUS-46)

## Contexto

O Qlareo é single-tenant: não existe usuário, sessão nem login. A API é protegida
por um segredo compartilhado (`QLAREO_API_KEY` no header `x-api-key`) e a conta VTEX
vem de `process.env`, uma por processo. A refatoração multi-tenant precisa de
identidade real.

O modelo de dados já está decidido e não é reaberto aqui:

- `organizations` é a loja; cada org tem exatamente uma conta VTEX, garantido por
  `UNIQUE(org_id)` em `vtex_accounts`.
- Um usuário pode ter N `memberships` (agência, multi-marca), com PK `(user_id, org_id)`
  e `role` em `owner`/`admin`/`viewer`.
- A org ativa vive na sessão e é validada contra `memberships` a cada request.
- As tabelas de dados seguem com `store_account` como discriminador.

Restrições do ambiente que pesam na escolha:

- **Postgres gerenciado neutro** (Neon/RDS/Railway), acessado por `DATABASE_URL` com o
  driver `pg`. Toda a camada de dados depende da porta `SqlClient` de `store/sql.ts`;
  `store/postgres/pgClient.ts` é o único arquivo que importa `pg`.
- **Next 16.2.11 na Vercel.** A issue 2.5 exige sessão legível server-side em middleware
  e route handlers; a 3.5 exige redirect por `onboarding_completed`.
- **Um dev de produto, sem time de plataforma.** Nada de auth caseiro: hash de senha,
  fluxo de recuperação e gestão de sessão não são código que este projeto escreve.

## Opções

### A. Clerk

SaaS de identidade com SDK de primeira classe para Next App Router. Sessão legível no
middleware e em Server Components sem round-trip ao banco.

### B. Supabase Auth

Serviço de auth acoplado a um Postgres Supabase, com `auth.users` como tabela no mesmo
banco da aplicação. RLS integrado por `auth.uid()`.

### Custo nos 3 pontos de escala

A unidade de cobrança é o **lojista**, não o consumidor final da loja. 10.000 MAU
significaria ~10 mil lojas VTEX usando o Qlareo — ordem de grandeza acima do alvo de
médio prazo.

| MAU (lojistas) | Clerk | Supabase Auth |
|---|---|---|
| 100 | US$ 0 | US$ 0 |
| 1.000 | US$ 0 | US$ 0 |
| 10.000 | US$ 0 | US$ 0 |

Os dois cobrem os três pontos dentro do plano gratuito:

- **Clerk:** 50.000 MRU inclusos no Hobby; Pro US$ 25/mês (US$ 20 anual) com os mesmos
  50.000 inclusos, excedente a US$ 0,02/MRU. A unidade é **MRU** (*monthly retained
  users* — quem volta 24h+ depois do cadastro), mais estreita que MAU.
- **Supabase:** 50.000 MAU no Free; Pro US$ 25/mês com 100.000 MAU inclusos, excedente a
  US$ 0,00325/MAU. MFA por telefone é cobrado à parte (US$ 75/mês pelo primeiro projeto);
  SSO SAML tem 50 inclusos e US$ 0,015/MAU depois.

Preços consultados em **2026-07-31** em [clerk.com/pricing](https://clerk.com/pricing) e
[supabase.com/pricing](https://supabase.com/pricing).

**Conclusão de custo: empate em zero.** Preço não decide este ADR, e qualquer análise que
o trate como critério principal está otimizando a variável errada. O que decide é o
encaixe com o modelo de orgs e o custo de saída.

### Org/multi-tenancy nativa contra o modelo real

Os dois oferecem organizações gerenciadas. **Nenhuma das duas serve**, pelo mesmo motivo:

`organizations` e `memberships` precisam viver no nosso Postgres de qualquer forma.

- O 1:1 org↔conta VTEX é uma constraint (`UNIQUE(org_id)` em `vtex_accounts`) sobre uma
  tabela nossa. Um provider externo não a impõe.
- `resolveTenant(session) → { orgId, storeAccount }` (issue 1.3) resolve o `store_account`
  por join com `vtex_accounts`. Um round-trip a uma API externa no caminho quente de toda
  request é custo sem retorno.
- O RLS da issue 1.4 usa `current_setting('qlareo.store_account')`, populado pela camada de
  acesso dentro da transação. Nada disso conversa com um serviço de orgs externo.
- O delete em cascata por org da 1.5 (LGPD) precisa de FK real, numa transação só.

Usar o recurso nativo criaria **duas fontes de verdade para membership** — a do provider e a
nossa — com a checagem de 403 lendo de uma e a cascata de delete operando na outra. Isso é
uma classe inteira de bug de isolamento entre tenants, exatamente o risco que a issue 3.6
existe para provar que não acontece.

Consequência prática: o add-on B2B do Clerk (**US$ 100/mês**, 100 MRO inclusos) é
**dispensável**, e o `auth.uid()` do Supabase deixa de ser vantagem, porque nosso RLS não é
baseado em usuário e sim em `store_account`.

### Esforço de saída

**Clerk.** Export de usuários em CSV pelo Dashboard (Settings → User Exports → Export all
users), incluindo o campo `password_digest`. O hash é **bcrypt**, algoritmo padrão que
qualquer destino aceita — a migração preserva as senhas, sem reset forçado. Export em JSON
com dados adicionais sai por ticket no suporte. Existem migradores prontos de terceiros
(WorkOS, Better Auth). Limitação real: o export é um *snapshot*, então uma migração de
verdade precisa de janela ou de dupla escrita para não perder cadastros feitos no meio.

**Supabase.** `auth.users` é uma tabela num Postgres que é seu; o hash (bcrypt) sai por
`pg_dump` como qualquer outro dado, sem depender de UI nem de suporte. Saída estruturalmente
mais barata — mas essa vantagem só existe se o Postgres de produção **for** Supabase.

**O ponto que decide.** Nosso Postgres é gerenciado neutro. Escolher Supabase Auth aqui
significaria uma de duas coisas: migrar o banco inteiro para Supabase — decisão de infra
fora do escopo desta refatoração — ou operar **dois** Postgres, um só para `auth.users`,
com o join usuário↔membership atravessando a fronteira entre eles. A segunda opção descarta
justamente o motivo de escolher Supabase Auth e ainda adiciona um banco para operar,
monitorar e incluir no procedimento de LGPD.

## Decisão

**Clerk**, com identidade espelhada em tabela local.

O critério não foi preço (empatado em zero) nem recurso de organizações (descartado nos
dois). Foi o encaixe com um Postgres neutro somado à integração com Next 16 server-side,
que é requisito direto das issues 2.5 e 3.5.

**Onde mora a identidade:** tabela `users` **local**, com o id do Clerk numa coluna
`clerk_user_id TEXT NOT NULL UNIQUE` — não o id do provider como chave direta.

Motivos:

- `memberships` tem PK `(user_id, org_id)` e FK `ON DELETE CASCADE`. Isso exige uma linha
  local para referenciar; FK para um serviço externo não existe.
- A cascata de offboarding da issue 1.5 roda numa transação só, no nosso banco.
- Trocar de provider vira uma migração de coluna, não uma reescrita de todas as tabelas
  que referenciam usuário.
- Dados nossos sobre o usuário (preferências, auditoria) têm onde morar sem inflar metadata
  no provider.

O preço disso é sincronização: a linha local nasce no signup (issue 3.2, na mesma transação
que `organizations` e `memberships`) e é reconciliada por webhook de `user.deleted`. Esse
custo é conhecido e aceito.

**Fica com o provider, explicitamente:** hash de senha, fluxo de recuperação/reset,
verificação de e-mail e gestão de sessão (emissão, renovação e revogação). Nenhuma linha
desse conjunto é escrita neste projeto. Uma PR que introduza hash de senha próprio contraria
este ADR.

**Não usamos** Clerk Organizations. Orgs e memberships são nossos.

## Consequências

**Positivas**

- Zero custo até 50.000 MRU, muito além do horizonte de decisão.
- Middleware e route handlers leem sessão server-side sem round-trip ao banco — atende 2.5
  e 3.5 direto.
- O Postgres continua neutro: `pgClient.ts` segue como único ponto de contato com `pg`, e
  o banco pode migrar de provedor sem tocar em auth.
- Saída preserva senhas: bcrypt em CSV, migradores de terceiros existentes.
- Uma fonte de verdade só para membership — nossa.

**Negativas**

- Dependência de SaaS no caminho de login: indisponibilidade do Clerk impede login (não
  derruba sessões já emitidas nem o sync, que roda fora do app).
- Sincronização `users` ↔ Clerk exige webhook e tratamento de divergência; um usuário
  apagado no dashboard e não propagado deixa linha órfã. Precisa de teste.
- Dado pessoal de lojista passa a existir em processador fora do Brasil — some-se ao que o
  README já registra sobre custódia de credencial e posição de operador LGPD.
- O export é snapshot: migrar de verdade exige janela ou dupla escrita.

**Gatilhos de revisão**

- Se o Postgres de produção virar Supabase, este ADR deve ser reaberto — o argumento
  central muda.
- Se um cliente exigir SSO/SAML corporativo, reavaliar: é onde o preço dos dois passa a
  divergir de fato.
- Se aparecer necessidade de convite/gestão de membros com UI pronta, medir o custo de
  construir contra o add-on B2B de US$ 100/mês — mas sem mover a fonte de verdade de
  membership para fora do nosso banco.

## Fontes

- [Clerk — Pricing](https://clerk.com/pricing) (consultado em 2026-07-31)
- [Supabase — Pricing](https://supabase.com/pricing) (consultado em 2026-07-31)
- [Clerk Docs — Migrating your data](https://clerk.com/docs/guides/development/migrating/overview)
- [WorkOS — Migrate from Clerk](https://workos.com/docs/migrate/clerk) (formato do hash e `password_digest`)
