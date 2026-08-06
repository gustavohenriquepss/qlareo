# ADR 0002 — Contrato app ↔ sync

- **Status:** aceito
- **Data:** 2026-07-31
- **Issue:** [GUS-50](https://linear.app/padeiro/issue/GUS-50/02-adr-contrato-app-sync)
- **Bloqueia:** Fase 2 (GUS-45), Fase 5 (GUS-48) e a UI de onboarding GUS-74 (4.3)
- **Relacionado:** [ADR 0003](./0003-chave-de-criptografia.md) — quem consegue descriptografar

## Contexto

Hoje o sync é um CLI em processo. `scripts/sync.ts` lê `loadConfig()`, monta o adapter com
`buildVtexAdapter(config.vtex)`, cria o store e chama:

```ts
syncOrders(adapter, store, storeAccount, range, { enrichItems })
```

Três propriedades do código atual condicionam qualquer contrato que se escreva aqui:

1. **`syncOrders` é um único `await` sem reporte de progresso.** Ele busca o intervalo
   inteiro, opcionalmente enriquece, faz `upsertOrders` e grava a marca d'água. Entre o
   início e o fim não há nenhum ponto observável de fora.
2. **O fatiamento por data já existe, mas é interno ao adapter.** `fetchRawInRange` divide
   o intervalo recursivamente quando estoura o teto de 3.000 da List Orders. Isso é
   invisível para o chamador — de fora, um range de 2 anos é uma chamada só.
3. **A credencial precisa existir em claro para o adapter existir.** `buildVtexAdapter`
   recebe appKey/appToken; sem eles não há `HttpClient` autenticado.

O alvo declarado é rodar o worker em Lambda. O app é Next na Vercel, o banco é Postgres
gerenciado neutro, e o time é uma pessoa.

## Decisões

### 1. Disparo: tabela de jobs em Postgres, não fila dedicada

**Decisão: `sync_jobs` no Postgres, consumida com `SELECT … FOR UPDATE SKIP LOCKED`.**

O motivo é o alvo Lambda, não apesar dele:

- **A UI de onboarding (4.3) precisa ler status de qualquer forma.** Com SQS, a fila carrega
  a mensagem mas não responde "como vai minha primeira sincronização" — seria preciso uma
  tabela de status *além* da fila. A tabela sozinha resolve as duas coisas; a fila sozinha
  não resolve nenhuma das duas por inteiro.
- **Zero infra nova para operar.** O Postgres já está de pé, já tem migrations, backup e
  procedimento de LGPD. Uma fila dedicada adiciona um segundo sistema com seu próprio
  failure mode, para um volume que é de dezenas de jobs por dia.
- **`SKIP LOCKED` dá as garantias que importam** — at-least-once, sem dois workers pegando
  o mesmo job — e a idempotência que torna at-least-once seguro já existe no `upsertOrders`
  (`ON CONFLICT (store_account, order_id) DO UPDATE`), como a issue 5.4 prova.

O que se perde, declarado: `SKIP LOCKED` é polling, então gasta uma query por ciclo mesmo
com a fila vazia, e não escala para milhares de jobs por segundo. Nenhuma das duas coisas
é problema nesta ordem de grandeza — e a troca por SQS depois é reescrever o consumidor,
não o modelo de dados, porque o status continuaria em tabela de todo jeito.

**Acordar o worker** tem dois caminhos, e usamos os dois:

- **Invoke direto no enfileiramento**, para o primeiro sync do onboarding. Esperar até um
  minuto pelo próximo ciclo de polling na tela de cadastro é ruim, e é a única hora em que
  a latência é visível para o lojista.
- **Varredura agendada** (EventBridge, 1 min) como rede de segurança: pega retry, job órfão
  de worker que morreu, e o incremental de rotina. É o que garante que nenhum job fica
  parado se o invoke direto falhar.

O invoke direto é otimização de latência; a corretude está toda na varredura.

### 2. Chaves mínimas do job

O job carrega exatamente os argumentos de `syncOrders` que não são construídos pelo worker.
`adapter` e `store` **não** entram: são montados no consumo, a partir de `store_account`.

| Coluna | Mapeia para | Nota |
|---|---|---|
| `store_account` | `storeAccount` | o discriminador; nunca `org_id` — a camada de dados fala `store_account` |
| `range_start`, `range_end` | `range: DateRange` | `TIMESTAMPTZ`, meia-aberto na semântica do core |
| `enrich_items` | `options.enrichItems` | `BOOLEAN NOT NULL DEFAULT false` |

Mais o que o job precisa como unidade de trabalho, e não como argumento:

| Coluna | Para quê |
|---|---|
| `id` | identidade |
| `batch_id` | agrupa as fatias de um mesmo pedido de sync — é o que torna progresso possível (ver 3) |
| `status` | `queued` / `running` / `succeeded` / `failed` / `dead` |
| `attempts`, `last_error` | retry com teto (5.2); `last_error` **nunca** contém appKey/appToken |
| `orders_synced` | contador para o progresso |
| `created_at`, `started_at`, `finished_at` | latência e diagnóstico |

**O que não entra no job: credencial.** Ver decisão 4.

### 3. Status e progresso para a UI de onboarding

Aqui o contrato precisa mudar o código, não só descrevê-lo. Como `syncOrders` é um único
`await`, um job = um range significa que o progresso só tem dois valores: 0% e 100%. Para a
primeira sincronização de uma loja com anos de histórico, isso é uma tela parada por
minutos — inaceitável em onboarding, que é onde o lojista decide se o produto funciona.

**A granularidade vem do chunking da issue 5.5**, promovido de detalhe de execução a parte
do contrato: um pedido de sync vira **N jobs irmãos** compartilhando `batch_id`, cada um
com uma fatia do range. Uma invocação processa uma fatia e as demais ficam na fila.

A UI de 4.3 lê progresso por agregação, sem nunca falar com o worker:

```sql
SELECT status, count(*), sum(orders_synced)
  FROM sync_jobs WHERE batch_id = $1 GROUP BY status;
```

Progresso = fatias terminadas / fatias totais. É progresso real, derivado de trabalho
concluído e commitado, não de estimativa. Consequências assumidas:

- O tamanho da fatia é configurável e é o que define a granularidade da barra. Fatia menor
  = barra mais suave e mais seguro no timeout do Lambda; fatia maior = menos overhead.
- O `batch_id` precisa entrar na `sync_jobs` da issue 5.1 — que hoje não o lista.
- **A marca d'água exige cuidado.** `syncOrders` grava `setSyncState` no fim de cada
  chamada, com o maior `created_at` visto *naquela fatia*. Com fatias fora de ordem, uma
  fatia antiga terminando por último rebaixaria a marca. `setSyncState` passa a ser
  monotônico — só avança, nunca retrocede. Isso é mudança de comportamento e vai como
  critério para a 5.5.

Erro: o worker grava `last_error` e incrementa `attempts`. Excedido o teto, o job vai para
`dead` e a UI mostra falha acionável para aquele intervalo, sem travar o batch inteiro.

### 4. Quem descriptografa: o worker, no consumo

**Decisão: o job não carrega credencial. O worker resolve `store_account` → `vtex_accounts`
e descriptografa na hora de montar o adapter.**

**O token não pode trafegar em claro no payload do job.** A `sync_jobs` é uma tabela comum
do mesmo banco: um segredo em claro numa coluna dela apareceria em backup, em dump de
diagnóstico, em qualquer `SELECT *` de investigação, e sobreviveria à conclusão do job.
Isso anularia a issue 4.1, que existe justamente para que appKey/appToken só existam
cifrados em repouso.

Consequência para o [ADR 0003](./0003-chave-de-criptografia.md), que fica registrada como
requisito e não como sugestão: **o worker é um consumidor de primeira classe da chave de
criptografia.** Um desenho em que só o app Next consegue descriptografar está descartado
por este ADR. A credencial em claro existe apenas em memória do worker, durante a execução
do job.

### 5. O worker importa `store/sync.ts` do repo

**Decisão: mesmo repositório e mesmo workspace, artefato de deploy separado. Sem cópia.**

Uma cópia própria significa duas implementações do mesmo `upsertOrders` divergindo em
silêncio — e o modo de falha é o pior possível: relatórios com números diferentes conforme
quem escreveu a linha. O projeto inteiro é construído em cima de portas (`OrderStore`,
`HttpClient`, `SqlClient`) exatamente para que a mesma lógica sirva a chamadores diferentes;
duplicar o sync desperdiça isso.

O worker é um entrypoint fino: lê o job, resolve credencial, monta adapter e store, chama
`syncOrders`, grava o resultado. Toda a lógica continua em `store/sync.ts`.

Isso depende da unificação do workspace (issue 2.1) e preserva duas invariantes existentes:
`pg` continua atrás do import dinâmico de `store/factory.ts` (cold start não paga o que não
usa) e `pgClient.ts` continua o único arquivo que importa o driver.

## Consequências

**Positivas**

- Nenhuma infra nova: fila, status e dados no mesmo Postgres, numa transação quando preciso.
- Progresso de onboarding é real e derivado de trabalho commitado.
- Segredo nunca em repouso fora de `vtex_accounts`.
- Uma implementação de sync só; o CLI `scripts/sync.ts` continua funcionando standalone.
- Trocar por SQS depois não mexe no modelo de dados nem na UI.

**Negativas**

- Polling gasta query com fila vazia; o custo é baixo mas não é zero.
- Chunking em jobs irmãos torna `setSyncState` monotônico — mudança de comportamento no
  código atual, com risco de regressão se não for coberta por teste.
- `batch_id` é escopo novo para a issue 5.1.
- Dois caminhos de acordar o worker (invoke + varredura) é mais superfície que um; mitigado
  por a corretude depender só da varredura.
- O worker precisa de acesso à chave de criptografia, o que amplia a superfície de quem
  pode ler credencial de lojista.

**Gatilhos de revisão**

- Volume passando de ~1 job/segundo sustentado, ou necessidade de fan-out entre múltiplos
  workers: reavaliar SQS.
- Se o timeout do Lambda apertar mesmo com a menor fatia útil, o problema é o
  `fetchRawInRange` fazer a recursão inteira dentro de uma invocação — aí a fatia precisa
  virar unidade menor que a fatia natural do adapter.
