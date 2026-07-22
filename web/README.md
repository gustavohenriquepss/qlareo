# QLAREO — interface

Front-end do [QLAREO](../README.md): Next.js 16, React 19, Tailwind v4 e
Recharts. Projeto npm **separado** do backend, que ele consome só por HTTP —
nada daqui importa `core/` nem fala com o Postgres.

## Rodar

Precisa do backend de pé (`npm start` na raiz, porta 3000).

```bash
cp .env.example .env.local   # QLAREO_API_URL + a MESMA QLAREO_API_KEY do backend
npm install
npm run dev                  # http://localhost:3001
```

`npm run lint` e `npm run typecheck` antes de commitar.

## Rotas

| Rota | Tela |
|---|---|
| `/vendas` | Faturamento, pedidos e ticket médio por dia/semana/mês |
| `/vendas/pagamento`, `/vendas/seller` | os mesmos números por meio de pagamento e por seller |
| `/clientes` | Novos vs. recorrentes e taxa de recompra |
| `/produtos` | Top produtos e curva ABC |
| `/promocoes` | Receita com desconto e custo do desconto |
| `/api/export/:key` | o relatório da tela como CSV |

## O que é bom saber antes de mexer

- **`lib/api.ts` é server-only.** A `QLAREO_API_KEY` sai do ambiente do processo
  Next e vai no header `x-api-key` numa chamada servidor→servidor; o browser só
  recebe números renderizados. Não importe esse módulo de um `"use client"` e
  não exponha nada dele via `NEXT_PUBLIC_*`.
- **Erro do backend é valor de retorno (`ApiResult`), não exceção.** Falha da
  API é estado normal de uma tela de relatório e merece mensagem honesta com o
  próximo passo, não uma página de erro genérica.
- **Filtros moram na query string** (`lib/filters.ts`), então as páginas são
  Server Components que leem `searchParams`. As telas ficam linkáveis, o botão
  voltar funciona e o recorte sobrevive ao reload.
- **CSV é contrato**: as colunas de todas as exportações estão num registro só
  (`lib/exports.ts`). O arquivo não é a tabela da tela — data em ISO, `productId`
  incluído, sem linha de total e sem preâmbulo de metadados.
- Esta versão do Next tem mudanças incompatíveis com o que você talvez conheça:
  consulte `node_modules/next/dist/docs/` antes de escrever código (ver
  [`AGENTS.md`](AGENTS.md)).
