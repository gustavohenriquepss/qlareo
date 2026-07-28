# QLAREO

Relatórios de vendas simples e confiáveis para lojistas **VTEX**, como
**aplicação standalone** — um serviço próprio que consulta a Orders API da loja,
guarda os pedidos em Postgres e entrega, numa interface web, os relatórios que
respondem "como foi a venda":

| Relatório | Responde |
|---|---|
| **Vendas por período** | Faturamento, pedidos e ticket médio por dia/semana/mês; por pagamento e por seller |
| **Novos vs. recorrentes** | Clientes de primeira compra vs. repetidos e taxa de recompra |
| **Top produtos + Curva ABC** | Quais produtos concentram a receita, com classe A/B/C |
| **SKUs vendidos** | A mesma curva por VARIAÇÃO: qual tamanho encalha e qual vive em ruptura |
| **Efetividade de promoções** | Quanto de receita andou com desconto e quanto o desconto custou |
| **Vendas por região** | Para qual UF a loja vende, com ticket médio e participação |
| **Cupons e origem** | Qual cupom e qual campanha geraram receita — o "por quê" das promoções |
| **Pedidos cancelados** | Taxa de cancelamento, valor que não entrou, e por qual situação e pagamento |

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
popula o store a partir da VTEX. E existe um **front-end Next.js** (`web/`) que
consome a API: as quatro telas, com filtros linkáveis, gráficos e exportação
CSV. O que ainda é roadmap: sync **incremental** via Orders Feed (hoje o sync
busca um intervalo por vez) — a marca d'água (`sync_state`) já está no schema
para isso.

## Arquitetura

**Ports & adapters.** O motor de relatórios não conhece VTEX; a plataforma entra
por uma porta.

```
qlareo/
├── core/              # ── AGNÓSTICO DE PLATAFORMA ──
│   ├── types.ts       # modelo canônico de pedido (a fronteira)
│   ├── adapter.ts     # interface PlatformAdapter (a porta)
│   ├── reports.ts     # os relatórios
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
├── __tests__/         # runner nativo do Node
└── web/               # ── FRONT-END (Next.js, projeto npm à parte) ──
    ├── app/           # uma rota por relatório (Server Components)
    │   └── api/export/[key]/   # CSV como URL, não Blob no browser
    ├── components/    # tabela, filtros, estados + charts/ (Recharts)
    └── lib/           # api (server-only), filters (query string), csv, exports
```

Três fronteiras carregam o design:

- **`transport/`** — o que muda entre o app IO e o standalone. No app, o
  transporte é a sessão do admin; aqui é um par appKey/appToken. `core/` e
  `adapters/vtex/` são idênticos aos do app.
- **`store/`** — o que o banco adiciona. Os relatórios lêem da interface
  `OrderStore`, não da API. O `sync` preenche o store a partir do adapter. A
  implementação Postgres fica atrás da porta `SqlClient`, então o único arquivo
  que importa o driver `pg` é `store/postgres/pgClient.ts`.
- **`web/`** — projeto npm separado, que fala com o backend só por HTTP. Não
  importa `core/` nem toca no banco: se a API muda, muda um cliente; e o
  front-end pode ser implantado em outro lugar (ou trocado) sem mexer no motor.

Fluxo: `sync` (VTEX → store) roda periodicamente; o servidor responde relatórios
lendo do store; o `web/` renderiza esses relatórios no servidor Next. Isolamento de tenant é invariante — todo acesso ao store leva o
`store_account` (single-tenant hoje, schema pronto para multi).

## Rodar

São **dois processos**: o backend na raiz (porta 3000) e o front-end em `web/`
(porta 3001). O backend requer **Node ≥ 22.18** (execução nativa de TypeScript;
sem passo de build) e não tem dependência de runtime além do driver `pg`.

```bash
# ── backend (raiz) ──
cp .env.example .env      # preencha as credenciais VTEX

npm run demo              # roda os 4 relatórios com dados sintéticos (sem VTEX)
npm test                  # 151 testes, zero dependência externa

# Com banco (produção-like):
docker compose up -d      # sobe o Postgres local
npm run migrate           # aplica db/migrations/*.sql
npm run sync -- --from=2026-01-01 --to=2026-01-31 --items   # VTEX → banco
npm start                 # API em http://localhost:3000
```

> **A migration `002_order_attribution` exige um re-sync.** Ela adiciona UF,
> cidade, cupom e UTM — campos que vêm do mesmo Get Order dos itens — e, por
> isso, **rebaixa `items_synced` de todo pedido já sincronizado**. O detalhe
> desses pedidos foi buscado por um código que ainda não lia esses campos;
> mantê-los marcados como sincronizados faria os relatórios reportarem a lacuna
> como se fosse dado ("100% sem região"). Até rodar `npm run sync -- --items` de
> novo, os cinco relatórios de detalhe (produtos, SKUs, promoções, região,
> origem) respondem "não sincronizado" em vez de números — que é a resposta
> correta, não a mais agradável.

```bash
# ── front-end (web/), noutro terminal ──
cd web
cp .env.example .env.local   # QLAREO_API_URL + a MESMA QLAREO_API_KEY do backend
npm install
npm run dev                  # interface em http://localhost:3001
```

O `web/` só sobe telas úteis com o backend de pé: cada página é um Server
Component que busca da API a cada requisição (`cache: "no-store"` — relatório de
vendas não serve número velho sem o usuário pedir). Com o backend fora do ar, a
tela mostra o erro e o que fazer, em vez de uma página de erro genérica.

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

E no `web/.env.local` (front-end):

| Variável | Para quê |
|---|---|
| `QLAREO_API_URL` | onde o backend ouve (default `http://localhost:3000`) |
| `QLAREO_API_KEY` | mesma chave do backend, mandada no `x-api-key` |

**Sem prefixo `NEXT_PUBLIC_`, de propósito.** A chave é lida só em Server
Components (`web/lib/api.ts`) e viaja numa chamada servidor→servidor; o browser
recebe apenas números já renderizados. Com o prefixo, a chave iria no bundle e
qualquer visitante leria o faturamento da loja.

### API

```
GET /health
GET /api/reports/sales-by-period?from=ISO&to=ISO&scope=liquido&grain=day
GET /api/reports/new-vs-returning?from&to&scope
GET /api/reports/top-products?from&to&scope
GET /api/reports/top-skus?from&to&scope
GET /api/reports/promotions?from&to&scope
GET /api/reports/canceled-orders?from&to&grain
GET /api/reports/sales-by-region?from&to&scope
GET /api/reports/coupons-and-sources?from&to&scope
```

`scope` ∈ `bruto` | `liquido` | `todos`. Todas as rotas (menos `/health`) exigem
o header `x-api-key` quando `QLAREO_API_KEY` está definido.

**`canceled-orders` ignora `scope`**, e é a única rota que faz isso. O recorte
existe para tirar cancelados do faturamento; aplicá-lo a um relatório *sobre*
cancelados devolveria vazio sempre. Além disso a taxa de cancelamento precisa do
total de pedidos do período como denominador, que um conjunto já filtrado não
tem como informar. A interface esconde o controle de Recorte nessa tela, para
não oferecer um filtro que a rota não obedece.

## Interface (`web/`)

Next.js 16 + React 19, Tailwind v4 e Recharts. Uma rota por relatório, com os
recortes de vendas como sub-rotas:

| Rota | Tela |
|---|---|
| `/vendas` | Faturamento, pedidos e ticket médio por dia/semana/mês |
| `/vendas/pagamento`, `/vendas/seller` | os mesmos números, quebrados por meio de pagamento e por seller |
| `/clientes` | Novos vs. recorrentes e taxa de recompra |
| `/produtos`, `/produtos/skus` | Curva ABC por produto e por SKU |
| `/promocoes` | Receita com desconto e custo do desconto |
| `/regiao` | Faturamento por UF de entrega, com ticket médio e participação |
| `/origem` | Faturamento por cupom, origem (utm_source) e campanha |
| `/cancelados` | Pedidos e valor cancelados (só cancelamento concluído), taxa e por pagamento |

Três decisões que explicam a maior parte do código:

- **Os filtros vivem na query string**, não em estado de componente. A tela de
  relatório precisa ser linkável ("o mês passado no líquido" é um link que se
  manda para um colega), o botão voltar precisa funcionar e o recorte precisa
  sobreviver ao reload. Os links do menu carregam a query atual — trocar de
  relatório não perde o período.
- **Exportação CSV é uma URL** (`/api/export/:key?from&to&scope`), não um `Blob`
  gerado no browser: funciona como link comum, aceita nova aba, entra no
  gerenciador de downloads, é anunciada por leitor de tela e dá para agendar num
  `curl`. O catálogo de colunas fica num registro único (`web/lib/exports.ts`) —
  cabeçalho de CSV é contrato com a planilha de alguém.
- **A tela mostra recorte; o arquivo traz o período inteiro.** A ABC desenha 12
  barras, a tabela abre fechada — o CSV não herda nenhum desses limites, e não
  leva linha de total nem preâmbulo de metadados (é o que faz o Excel errar as
  colunas). Período e recorte vão no nome do arquivo.

## Privacidade — a diferença que importa neste modelo

Ser standalone **inverte a postura de privacidade** do app VTEX IO, e isso é
consciente, não acidental:

- **O app IO não custodia nada**: usa a sessão do admin e nada é persistido.
- **O QLAREO custodia credencial de terceiro.** O par appKey/appToken lê os
  pedidos da loja. Consequências assumidas:
  - Token **nunca** em código, log ou repositório — só em ambiente/segredo,
    cifrado em repouso. O transporte jamais o coloca em URL.
  - Com o banco, o serviço **armazena dados pessoais** (nome, e-mail, endereço
    dos clientes da loja) e é **operador sob a LGPD** — exige base legal,
    contrato de operador, política de retenção e resposta a incidente.

Isso deixou de ser hipótese: rodando com `DATABASE_URL`, o `sync` persiste
pedido e cliente. As obrigações acima valem a partir daí, e a decisão de operar
assim é comercial — deve ser tomada de olhos abertos. (Sem `DATABASE_URL`, em
modo memória, nada é persistido; mas isso é dev, não produção.)

## Licença

[MIT](LICENSE)
