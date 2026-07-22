# Diário de bordo — QLAREO

Registro honesto do desenvolvimento. O produto nasceu como spin-off do app VTEX
IO [`vtex-sales-reports`](https://github.com/gustavohenriquepss/vtex-sales-reports).

## 2026-07-22 — Round-trip real Node → pg → Postgres (última lacuna fechada)

O usuário instalou o Node.js oficial (v24.18.0 + npm 12.0.1), o que finalmente
permitiu instalar o driver `pg` e exercitar o caminho de produção inteiro. Isto
converte em "verificado" o item que eu vinha declarando abaixo como pendente
("a cola Node do driver pg / o round-trip real").

### ✅ Verificado de verdade (Node real + driver pg real + Postgres 18)

- `npm install` + `npm i pg` + `npm i -D @types/pg` — `pg@^8.22`,
  `@types/pg@^8.20` agora declarados no `package.json` (antes não existiam).
- Removido o stub manual `store/postgres/pg.d.ts` (só existia para o `tsc` não
  reclamar sem `@types/pg`). Com os tipos reais, ele colidiria.
- **`tsc --noEmit` limpo** e **151 testes verdes** com o Node de verdade (antes
  eu só tinha rodado via o node.exe embutido do Playwright).
- **`npm run migrate` real**: aplicou `001_init`, registrou em
  `schema_migrations`, e numa segunda rodada disse "nada a aplicar"
  (idempotência confirmada; a migration usa `IF NOT EXISTS`).
- **Round-trip do caminho de PRODUÇÃO** (`createPgClient` → `PostgresOrderStore`
  → driver `pg` → PG18), não mock: upsert com itens, getOrders com JOIN de itens
  na ordem de `line_no`, `BIGINT` chegando como number, re-upsert sem itens
  preservando detalhe (o `OR`), `sync_state`, e isolamento de tenant — todos
  passaram contra o banco real.
- **Servidor em modo Postgres**: subiu com `DATABASE_URL` (a fábrica fez o
  `import()` dinâmico do `pg`), e os endpoints `sales-by-period` e `top-products`
  (este exercita o JOIN de itens) responderam lendo do banco; `x-api-key`
  ausente → 401. Dados sintéticos e scripts temporários removidos; banco limpo.

### ❌ Achado real no caminho (corrigido)

- Os tipos oficiais do `pg` (`Pool.query`) exigem `params: any[]` **mutável**,
  mas a porta `SqlClient` usa `ReadonlyArray<unknown>` de propósito (a porta não
  deve permitir que a impl mute os parâmetros de quem chama). O `tsc` pegou:
  `readonly ... não atribuível a any[]`. Corrigido só na fronteira com o driver
  (`store/postgres/pgClient.ts`), copiando com `[...params]` no ponto exato da
  chamada ao `pg` — sem enfraquecer o contrato da porta.

### ⚠️ O que ainda não foi verificado

- **Nada validado contra a Orders API real da VTEX.** O `sync` (VTEX → banco) foi
  exercitado só com `fetch` mockado; o store foi testado com dados sintéticos. O
  primeiro contato real depende de credencial appKey/appToken de uma loja.

## 2026-07-21 — SQL verificado contra Postgres 18 real

O usuário instalou PostgreSQL 18 na máquina. Isso permitiu fechar a lacuna que
eu tinha declarado abaixo ("SQL real não verificado").

### ✅ Verificado de verdade (contra PG18, não mock)

- Setup sem eu tocar segredo: o usuário criou um role/db descartável
  (`qlareo/qlareo`) no terminal dele; a senha do superusuário nunca passou pelo
  chat. Conectei como `qlareo`.
- **Migration `001_init.sql` aplica limpa** no PG18 (3 tabelas, 3 índices).
- Rodei um script que replica as **queries exatas** do `PostgresOrderStore` com
  dados sintéticos e asserções (`RAISE EXCEPTION` + `ON_ERROR_STOP`, exit 0):
  1. isolamento de tenant + janela — loja-a nunca vê pedido da loja-b;
  2. `items_synced`/itens corretos no seed;
  3. re-upsert SEM itens: cabeçalho atualiza, `items_synced` fica TRUE (o `OR`),
     itens preservados — a lógica mais delicada, confirmada no banco real;
  4. o JOIN de itens preso ao tenant e à janela;
  5. `sync_state` upsert (INSERT + ON CONFLICT UPDATE).
- Banco deixado limpo (TRUNCATE dos dados sintéticos; schema intacto).

### ⚠️ O que AINDA não foi verificado (e por quê)

- **A cola Node do driver `pg`** (`store/postgres/pgClient.ts`) e o caminho
  runtime completo Node→pg→Postgres. Motivo: **não há `npm` na máquina**, então
  o driver `pg` não dá para instalar. O que verifiquei foi o SQL em si (a parte
  com risco real de bug) via `psql`; o mapa linha→CanonicalOrder está coberto
  por teste unitário com `SqlClient` falso. Falta só juntar os dois num round-trip
  real, o que depende de `npm i pg`.

## 2026-07-21 — Camada de banco (PostgreSQL)

Objetivo: sair do "consulta a Orders API a cada request" para "lê de um banco
local, sincronizado", removendo os tetos da API. Decisão de tenancy explicada ao
usuário (single vs multi) — escolhido **single-tenant com schema pronto para
multi** (coluna `store_account` em todas as tabelas/PKs).

### ✅ Deu certo

- **Fronteira nova bem posta**: porta `OrderStore` (interface), impl em memória
  (referência testável) e impl Postgres atrás de uma segunda porta `SqlClient` —
  o único arquivo que importa o driver `pg` é `store/postgres/pgClient.ts`. O
  resto do código nunca vê `pg`.
- **Relatórios religados ao store**: o servidor lê da interface, não da API. O
  `sync` (adapter → store) é o que preenche. Import dinâmico do Postgres mantém
  `pg` fora do caminho de dev/teste (nem instalado aqui).
- **Verificação**: `tsc --noEmit` limpo e **151 testes verdes** (+24: memoryStore,
  sync, Postgres store com SqlClient falso, servidor lendo do store). Servidor
  sobe em modo memória pelo entrypoint; demo intacto com os mesmos números.
- **Isolamento de tenant testado**: `store_account` em todo query; teste garante
  que uma loja nunca vê pedido de outra, e (no Postgres) que os valores vão
  parametrizados, não interpolados.
- **Schema honesto**: dinheiro em `BIGINT` centavos (a invariante de inteiro do
  core), índices por created_at/status/product, `sync_state` como marca d'água
  para o sync incremental futuro.

### ❌ Deu errado / limites do ambiente

- **Subagent do Postgres morreu por limite de gastos mensais** no meio da
  verificação. Mas ele já tinha escrito todos os arquivos; revisei um a um e
  rodei `tsc`/testes eu mesmo — o código estava correto (isolamento, UPSERT que
  preserva `items_synced` com `OR`, JOIN preso ao tenant). Terminei o que
  faltava (entrypoint `scripts/migrate.ts`, wiring da fábrica). Não spawnei outro
  subagent — o caminho caro.
- **NÃO consigo rodar Postgres nem instalar `pg` aqui** (sem npm, sem banco). O
  `pg.d.ts` (stub mínimo do módulo) mantém o `tsc` limpo sem `@types/pg`. Então:
  - **Verificado de verdade**: contrato do store (via memória), sync, servidor
    lendo do store, e — no Postgres store — isolamento/parametrização/mapeamento
    contra um `SqlClient` FALSO.
  - **NÃO verificado**: o SQL real contra um Postgres de verdade. Isso depende de
    `docker compose up` + `npm run migrate` + `@types/pg`/`pg` instalados —
    passo do usuário. Não afirmo que "funciona no Postgres", só que compila e
    passa os testes de contrato.

## 2026-07-21 — Nascimento do repositório standalone

Decisão: o standalone vira **produto separado, em repo próprio** (não um modo do
app IO). O app IO segue VTEX-only e sem custódia de credencial; o QLAREO assume
a operação em troca de remover os tetos da plataforma.

### ✅ Deu certo

- **Fundação reaproveitada sem reescrever**: `core/` (agnóstico) e
  `adapters/vtex/` vieram prontos e testados da branch de refactor do app repo.
  Colados na raiz do QLAREO (espelhando a estrutura original) para não quebrar
  um único import — arquivos provados ficaram byte-idênticos.
- **A peça nova que define "standalone": `transport/fetchHttpClient.ts`** —
  implementa o seam `HttpClient` do adapter com `fetch` nativo e auth por
  appKey/appToken, no lugar da sessão do admin. O adapter e o core não
  perceberam a troca.
- **Servidor HTTP nativo** (sem framework), 4 rotas + `/health`, auth por
  `x-api-key`, config validada na subida. Costura de injeção de adapter permite
  testar o app inteiro por HTTP real em localhost com um adapter falso.
- **Verificação final**: `tsc --noEmit` limpo; **127 testes verdes** (106 da
  fundação + 7 do transporte + 6 de params + 8 do servidor e2e); o `demo`
  produz os mesmos números do app IO (R$ 950, ABC 80/95/100, recompra 50%,
  desconto R$ 130) — comportamento preservado através da nova fronteira.
- **`type: module` no package.json** eliminou o warning cosmético de "reparsing"
  que o app repo tinha — aqui não há builder VTEX ditando CommonJS.

### ❌ Deu errado / achados no caminho

- **Repeti a armadilha das parameter properties**: `VtexHttpError` com
  `constructor(public readonly status...)` estourou
  `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` sob type stripping. Campos explícitos
  resolvem. (Terceira vez que essa pegadinha aparece no projeto.)
- **`import.meta` não compila com `module: commonjs`.** Usei o guard
  `import.meta.url === argv[1]` em `main.ts` para "subir só quando executado
  direto". tsc reprovou (TS1343). Corrigido separando `server/start.ts` como
  entrypoint — melhor design: importar a app em teste não sobe socket, e some o
  `import.meta`.
- Deixei um `import` morto de `toMajor` no demo (guardado só para não acusar
  unused). Removido.

### ⚠️ Estado honesto (não esconder)

- **Sem banco e sem sync incremental ainda.** O MVP consulta a Orders API a cada
  requisição, igual ao app IO — então os tetos de 2.000 pedidos e de ~24 meses
  ainda valem na prática. A arquitetura está pronta para o banco; o ganho é
  roadmap, não estado atual. Declarado no README.
- **Nada validado contra a Orders API real.** O transporte foi testado só com
  `fetch` mockado. O primeiro contato real depende de credencial da loja.
- **Privacidade invertida**: ao ganhar banco, o QLAREO passa a custodiar
  credencial e dado pessoal de terceiro → operador LGPD. Documentado no README
  como decisão comercial consciente, não acidente de arquitetura.
