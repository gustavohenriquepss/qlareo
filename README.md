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

Rodar como serviço próprio, com banco no futuro, remove as duas limitações que
o app VTEX IO precisa declarar como intrínsecas:

- **Sem o teto de 2.000 pedidos** dos relatórios de item: com sync incremental
  (o Orders Feed é o primitivo), o custo do detalhe por pedido é pago uma vez.
- **Sem a janela de ~24 meses**: uma vez armazenado, o histórico acumula além do
  que a API mostra. Com o tempo, "novos vs. recorrentes" fica mais correto que o
  próprio Admin.

> Nota honesta: este MVP ainda **não** tem banco nem sync incremental — ele
> consulta a Orders API a cada requisição, como o app IO. A arquitetura está
> pronta para o banco entrar; o ganho acima é o roadmap, não o estado atual.

## Arquitetura

**Ports & adapters.** O motor de relatórios não conhece VTEX; a plataforma entra
por uma porta.

```
qlareo/
├── core/              # ── AGNÓSTICO DE PLATAFORMA ──
│   ├── types.ts       # modelo canônico de pedido (a fronteira)
│   ├── adapter.ts     # interface PlatformAdapter (a porta)
│   ├── reports.ts     # os 4 relatórios
│   ├── scope.ts       # recorte bruto/líquido/todos
│   ├── money.ts       # unidades mínimas inteiras
│   └── time.ts        # truncamento por fuso
├── adapters/vtex/     # ── ESPECÍFICO DA VTEX ──
│   ├── mapper.ts      # formato cru da OMS → canônico
│   └── orders.ts      # paginação + fatiamento do teto de 3.000
├── transport/
│   └── fetchHttpClient.ts   # Orders API via fetch + appKey/appToken
├── server/
│   ├── main.ts        # createApp: HTTP nativo, roteamento, auth
│   ├── reports.ts     # orquestra adapter + core
│   ├── params.ts      # validação da query
│   └── start.ts       # entrypoint (npm start)
└── __tests__/         # runner nativo do Node, sem dependência
```

A diferença de fundo para o app IO está em **`transport/`**: no app, o transporte
é a sessão do admin logado; aqui é um par appKey/appToken. O `core/` e o
`adapters/vtex/` são idênticos — trocar de transporte (ou de plataforma) não
toca em uma linha de relatório.

## Rodar

Requer **Node ≥ 22.18** (execução nativa de TypeScript; sem passo de build).

```bash
cp .env.example .env      # preencha as credenciais VTEX
npm start                 # sobe o servidor em http://localhost:3000

npm run demo              # roda os 4 relatórios com dados sintéticos (sem VTEX)
npm test                  # 127 testes, zero dependência externa
```

### Credenciais

O serviço consulta a loja com um par **appKey/appToken** gerado no Admin VTEX,
com o papel **OMS - View order**. Configure por ambiente (nunca no código):

| Variável | Para quê |
|---|---|
| `VTEX_ACCOUNT` | nome da conta (subdomínio) |
| `VTEX_APP_KEY` / `VTEX_APP_TOKEN` | credencial de leitura dos pedidos |
| `QLAREO_API_KEY` | protege o endpoint do próprio QLAREO (`x-api-key`) |
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
