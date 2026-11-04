# Qlareo — app

O app da Qlareo, em `app.qlareo.com`. A landing page (`qlareo.com`) fica em outro
repositório: [`gustavohenriquepss/qlareo-LP`](https://github.com/gustavohenriquepss/qlareo-LP).

## O produto

A Qlareo é uma **rede de mídia em sacolas de delivery**.

- Restaurantes recebem sacolas de papel kraft impressas **de graça**.
- Anunciantes locais pagam para aparecer nelas, **100% antecipado**.
- Dois planos: **Impacto** (um anunciante, sacola inteira, frente e verso) e **Alcance**
  (um anunciante por lado, o outro lado é de alguém que não concorre). Na landing o id
  continua `exclusiva` e `meia`.
- Restaurante não divide sacola com concorrente: comida, bebida e app de delivery não
  anunciam, e o restaurante vê cada arte antes.
- Piloto em **Itaboraí** e **Icaraí, Niterói** (RJ).

A landing vende. A conversa comercial acontece no WhatsApp do fundador.

## O que este repositório vai ter

Definido pela landing (ver o ADR-003 dela):

- **Redirect dos QR codes**, `/r/:slug`, com contagem de leituras. Cada sacola leva um
  QR do anunciante; a leitura passa por aqui antes de seguir para o destino dele.
- **Painel do anunciante**, onde ele acompanha a própria campanha.

Ainda não existe nada disso. Hoje `web/` é só a base: Next.js 16 (App Router),
TypeScript, Tailwind CSS v4, o design system e a logo, com uma página de espera em `/`.
O resto (modelo de dados, banco, autenticação, o que o painel mostra) está para ser
decidido.

## Rodar

```bash
cd web
npm install
npm run dev          # http://localhost:3001
npm run typecheck
npm run lint
npm run build
```

## Design system

`web/app/globals.css` é a **fonte da verdade** dos tokens da marca. A landing copia este
arquivo, e `web/components/Logo.tsx` também, literalmente. Por isso:

- **Mudança de token começa aqui** e desce para a landing (`qlareo-LP/app/globals.css`).
  Não mude o valor de um token sem levar a mudança para lá também.
- **Mantenha os caminhos.** O README da landing aponta para `qlareo/web/app/globals.css`
  e para `Logo.tsx`.
- `--primary` (`#1e40af`) pinta ação, `--brand` (`#2563eb`) é identidade. `BRAND_COLOR`
  em `Logo.tsx` duplica `--brand` para o `apple-icon`, que roda fora do navegador.
- Os tokens de gráfico (`--series-*`, `--abc-*`, `--grid`, `--axis`) vêm do produto
  anterior e foram validados para daltonismo e contraste. Ficam até alguém decidir o que
  o painel do anunciante desenha.

## Arquivo

O produto anterior (SaaS de relatórios de vendas para lojas VTEX: motor de relatórios,
adapter VTEX, Postgres multi-tenant com RLS, rotina de exclusão LGPD e as telas em
Next.js) está preservado fora do `main`.

| Onde | O que é |
| --- | --- |
| tag `legacy/relatorios-v1` | Snapshot imutável do último estado (commit `e82dd6e`). |
| branch `archive/relatorios` | Mesmo commit, para abrir preview ou continuar dali. |

Para recuperar:

```bash
git checkout legacy/relatorios-v1                         # só olhar (HEAD destacado)
git switch -c minha-branch legacy/relatorios-v1           # trabalhar a partir dele
git checkout legacy/relatorios-v1 -- docs/adr             # trazer uma pasta para o main
```

Talvez valha reaproveitar: o ADR de autenticação (`docs/adr/0001-auth-provider.md`,
Supabase Auth vs Clerk), o desenho de `organizations`/`memberships` e o padrão de
migrations em `db/migrations/`. Tudo isso estava amarrado à conta VTEX, então não volta
como está.

## Licença

[MIT](LICENSE)
