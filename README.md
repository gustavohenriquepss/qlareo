# QLAREO

Relatórios de vendas simples e confiáveis para lojistas **VTEX**, como
**aplicação standalone** — um serviço próprio que consulta a Orders API da loja
e entrega os quatro relatórios que respondem "como foi a venda":

| Relatório | Responde |
|---|---|
| **Vendas por período** | Faturamento, pedidos e ticket médio por dia/semana/mês; por pagamento e por seller |
| **Novos vs. recorrentes** | Clientes de primeira compra vs. repetidos e taxa de recompra |
| **Top produtos + Curva ABC** | Quais produtos concentram a receita, com classe A/B/C |
| **Efetividade de promoções** | Quanto de receita andou com desconto e quanto o desconto custou |

> **Relação com o app VTEX IO.** Existe também uma versão deste produto como
> [app nativo de Admin VTEX IO](https://github.com/gustavohenriquepss/vtex-sales-reports)
> — instalável via `vtex link`, sem servidor e sem custódia de credencial. O
> QLAREO é o **produto standalone**: roda como serviço próprio, o que remove os
> tetos da plataforma (ver abaixo) ao custo de assumir a operação. O motor de
> relatórios (`core/`) e o adapter VTEX foram extraídos daquele repositório.

## Por que standalone (o que se ganha)

Rodar como serviço próprio, com banco local, remove as duas limitações que o app
VTEX IO precisa declarar como intrínsecas:

- **Sem o teto de pedidos por consulta** nos relatórios de item: o `sync` paga o
  custo de puxar (e enriquecer) da API uma vez e grava no banco; os relatórios
  leem do banco, baratos.
- **Sem a janela de ~24 meses**: uma vez armazenado, o histórico acumula além do
  que a API mostra. Com o tempo, "novos vs. recorrentes" fica mais correto que o
  próprio Admin.

**Estado atual:** o banco (PostgreSQL) já existe. Os relatórios leem do store
(`DATABASE_URL` presente → Postgres; ausente → memória, para dev/demo). O `sync`
popula o store a partir da VTEX. O que ainda é roadmap: sync **incremental** via
Orders Feed (hoje o sync busca um intervalo por vez) — a marca d'água
(`sync_state`) já está no schema para isso.

## Arquitetura

**Ports & adapters.** O motor de relatórios não conhece VTEX; a plataforma entra
por uma porta.

```
qlareo/
├── core/              # ── AGNÓSTICO DE PLATAFORMA ──
│   ├── types.ts       # modelo canônico de pedido (a fronteira)
│   ├── adapter.ts     # interface PlatformAdapter (a porta)
│   ├── reports.ts     # os 4 relatórios
│   └── scope|money|time.ts
├── adapters/vtex/     # ── ESPECÍFICO DA VTEX ──
│   ├── mapper.ts      # formato cru da OMS → canônico
│   └── orders.ts      # paginação + fatiamento do teto de 3.000
├── transport/
│   └── fetchHttpClient.ts   # Orders API via fetch + appKey/appToken
├── store/             # ── PERSISTÊNCIA ──
│   ├── orderStore.ts  # a porta (interface OrderStore)
│   ├── memoryStore.ts # impl em memória (dev/teste)
│   ├── sync.ts        # adapter → store
│   ├── sql.ts         # porta SqlClient (isola o driver pg)
│   └── postgres/      # impl Postgres (isolada; único lugar com `pg`)
├── db/migrations/     # schema versionado (*.sql)
├── server/            # HTTP nativo: relatórios lêem do store
├── scripts/           # sync e migrate (CLIs)
└── __tests__/         # runner nativo do Node
```

Duas fronteiras carregam o design:

- **`transport/`** — o que muda entre o app IO e o standalone. No app, o
  transporte é a sessão do admin; aqui é um par appKey/appToken. `core/` e
  `adapters/vtex/` são idênticos aos do app.
- **`store/`** — o que o banco adiciona. Os relatórios lêem da interface
  `OrderStore`, não da API. O `sync` preenche o store a partir do adapter. A
  implementação Postgres fica atrás da porta `SqlClient`, então o único arquivo
  que importa o driver `pg` é `store/postgres/pgClient.ts`.

Fluxo: `sync` (VTEX → store) roda periodicamente; o servidor responde relatórios
lendo do store. Isolamento de tenant é invariante — todo acesso ao store leva o
`store_account` (single-tenant hoje, schema pronto para multi).

## Rodar

Requer **Node ≥ 22.18** (execução nativa de TypeScript; sem passo de build).

```bash
cp .env.example .env      # preencha as credenciais VTEX

npm run demo              # roda os 4 relatórios com dados sintéticos (sem VTEX)
npm test                  # 151 testes, zero dependência externa

# Com banco (produção-like):
docker compose up -d      # sobe o Postgres local
npm run migrate           # aplica db/migrations/*.sql
npm run sync -- --from=2026-01-01 --to=2026-01-31 --items   # VTEX → banco
npm start                 # servidor lê do banco em http://localhost:3000
```

O caminho Postgres foi verificado de ponta a ponta contra um Postgres 18 real,
pelo código de produção (`createPgClient` → `PostgresOrderStore` → driver `pg`):
`npm run migrate` aplica e é idempotente; upsert, JOIN de itens, preservação de
detalhe no re-upsert, `sync_state` e isolamento de tenant conferem no banco; e o
servidor em modo Postgres responde os relatórios lendo do banco. O SQL sozinho
também tem um script de asserções em [`db/verify_store.sql`](db/verify_store.sql)
(`psql -f db/verify_store.sql` num banco com as migrations aplicadas).

Sem `DATABASE_URL`, `npm start` sobe em **modo memória** (store vazio, sem
Postgres) — útil para desenvolvimento. O driver `pg` já está no `package.json`;
como o Postgres é carregado por `import()` dinâmico, o modo memória (e o
`npm test`) nunca o importa.

### Credenciais

O serviço consulta a loja com um par **appKey/appToken** gerado no Admin VTEX,
com o papel **OMS - View order**. Configure por ambiente (nunca no código):

| Variável | Para quê |
|---|---|
| `VTEX_ACCOUNT` | nome da conta (subdomínio) |
| `VTEX_APP_KEY` / `VTEX_APP_TOKEN` | credencial de leitura dos pedidos |
| `QLAREO_API_KEY` | protege o endpoint do próprio QLAREO (`x-api-key`) |
| `DATABASE_URL` | conexão Postgres; ausente → store em memória (dev) |
| `PORT` | porta do servidor (default 3000) |

### API

```
GET /health
GET /api/reports/sales-by-period?from=ISO&to=ISO&scope=liquido&grain=day
GET /api/reports/new-vs-returning?from&to&scope
GET /api/reports/top-products?from&to&scope
GET /api/reports/promotions?from&to&scope
```

`scope` ∈ `bruto` | `liquido` | `todos`. Todas as rotas (menos `/health`) exigem
o header `x-api-key` quando `QLAREO_API_KEY` está definido.

## Privacidade — a diferença que importa neste modelo

Ser standalone **inverte a postura de privacidade** do app VTEX IO, e isso é
consciente, não acidental:

- **O app IO não custodia nada**: usa a sessão do admin e nada é persistido.
- **O QLAREO custodia credencial de terceiro.** O par appKey/appToken lê os
  pedidos da loja. Consequências assumidas:
  - Token **nunca** em código, log ou repositório — só em ambiente/segredo,
    cifrado em repouso. O transporte jamais o coloca em URL.
  - Ao introduzir banco, o serviço passa a **armazenar dados pessoais** (nome,
    e-mail, endereço dos clientes da loja) e vira **operador sob a LGPD** —
    exige base legal, contrato de operador, política de retenção e resposta a
    incidente.

Enquanto não há banco, o QLAREO não persiste pedido nenhum: agrega em memória
por requisição e responde só números. O passo para o banco é também o passo que
aciona as obrigações acima — a decisão é comercial, e deve ser tomada de olhos
abertos.

## Licença

[MIT](LICENSE)
