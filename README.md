# Qlareo — app

O app da Qlareo, em `app.qlareo.com`. A landing page (`qlareo.com`) fica em outro
repositório: [`gustavohenriquepss/qlareo-LP`](https://github.com/gustavohenriquepss/qlareo-LP).

## O produto

A Qlareo é uma **rede de mídia em sacolas de delivery**.

- Restaurantes recebem sacolas de papel kraft impressas **de graça**.
- Anunciantes locais pagam para aparecer nelas, **100% antecipado**.
- **Uma marca por sacola.** O anunciante escolhe a arte num lado (R$ 2,00 por sacola) ou
  frente e verso (25% a mais, R$ 2,50), a partir de 1.000 sacolas por mês. Decisão do dono
  em 06/11/2026, que substituiu os planos Impacto e Alcance. O preço mora na landing
  (`lib/pricing.ts` de `qlareo-LP`); o app só guarda se são uma ou duas artes
  (`campaigns.sides`: `um_lado` ou `frente_e_verso`).
- Restaurante não divide sacola com concorrente: comida, bebida e app de delivery não
  anunciam, e o restaurante vê cada arte antes.
- Piloto em **Itaboraí** e **Icaraí, Niterói** (RJ).

A landing vende. A conversa comercial acontece no WhatsApp do fundador.

## O que este repositório vai ter

Definido pela landing (ver o ADR-003 dela):

- **Redirect dos QR codes**, `/r/:slug`, com contagem de leituras. Cada sacola leva um
  QR do anunciante; a leitura passa por aqui antes de seguir para o destino dele.
- **Painel do anunciante**, onde ele acompanha a própria campanha.

O painel serve para o anunciante **acompanhar as leituras dos QR codes** e **enviar as
artes das campanhas** (upload da arte pronta; a Qlareo revisa). Decisões já tomadas:

- **Supabase**: Postgres, login e armazenamento das artes num serviço só.
- **Cadastro aberto, com e-mail e senha.** Toda conta nova nasce com um anunciante próprio
  (nome da empresa do formulário) e não vê nada até a Qlareo ligar uma campanha a ela.
  O pagamento continua fora do sistema, pelo WhatsApp.
- **Um QR code por restaurante** dentro da campanha, para mostrar leituras por restaurante
  e por bairro.
- **O restaurante não usa o painel** por enquanto: aprova a arte pelo WhatsApp, e a Qlareo
  registra.

Ordem de construção, uma fatia por PR:

1. **Base** (feita): Supabase local, identidade com RLS, cadastro, login, confirmação de
   e-mail e recuperação de senha.
2. **`/r/:slug`** (feita): conta a leitura e redireciona.
3. **Área do operador** (feita): anunciantes, restaurantes, campanhas e o QR para a gráfica.
4. Leituras no painel: total, por dia e por restaurante.
5. Artes: upload por lado, versões, revisão e aprovação do restaurante.

## Rodar

Precisa de Node 22+ e do Docker Desktop aberto (o Supabase local roda em contêineres).

```bash
cd web
npm install
npm run db:start     # sobe o Supabase local e aplica migrations + seed
npx supabase status  # mostra a API URL e as chaves locais
npm run dev          # http://localhost:3001
```

Crie `web/.env.local` com os valores do `supabase status`:

| Variável | Valor local | Para quê |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `http://127.0.0.1:55321` | API do Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | "Publishable key" | chave pública; quem protege os dados é a RLS |
| `SUPABASE_SECRET_KEY` | "Secret key" | **só** para `npm run test:db`; ignora a RLS e nunca entra no app |
| `SCAN_HASH_SECRET` | qualquer texto (opcional em dev) | segredo do hash do visitante em `/r/:slug`; **obrigatório em produção** |

As `NEXT_PUBLIC_` são embutidas no build: na Vercel, cadastre as duas antes do deploy.

O Supabase local usa a faixa de portas **553xx** (e não a 543xx padrão) para conviver com
outros projetos Supabase na mesma máquina. O Studio fica em http://127.0.0.1:55323 e os
e-mails de confirmação e de senha caem no Mailpit, em http://127.0.0.1:55324.

O seed (`supabase/seed.sql`) cria duas contas locais, com senha `qlareo123`:
`operador@qlareo.local` (operador) e `anunciante@exemplo.local` (Padaria Exemplo). A
Padaria tem uma campanha com QR em dois restaurantes, com leituras dos últimos 14 dias:
http://localhost:3001/r/padaria-itaborai e http://localhost:3001/r/padaria-icarai.
`npm run db:reset` recria o banco do zero.

Checks:

```bash
npm run typecheck
npm run lint
npm test             # unitários
npm run test:db      # RLS contra o Supabase local (pulado sem as variáveis)
npm run build
```

## Banco e acesso

As migrations ficam em `web/supabase/migrations/`. Duas regras sustentam o desenho:

- **O que um usuário vê sai do vínculo em `advertiser_members`, conferido pela RLS.** O
  cadastro é aberto, então nenhuma tabela pode supor que só existe conta de cliente
  pago. `tests/db/rls.test.mts` tenta, com uma conta comum, ler e mexer no anunciante de
  outra; todas as tentativas têm que falhar.
- **O `proxy.ts` não é autorização.** Ele renova a sessão e desvia rotas (sem sessão →
  `/entrar`), mas quem decide o que cada um lê é o banco.

**Operador** é quem tem uma linha em `public.operators`. Não existe tela para virar
operador. Em produção, depois de a pessoa criar a conta, rode no SQL Editor do Supabase:

```sql
insert into public.operators (user_id)
select id from auth.users where email = 'email@do-operador';
```

## Área do operador (`/painel/operacao`)

Só aparece para operador; para qualquer outra conta, as rotas dão 404 (e a RLS barra as
escritas de qualquer jeito). O fluxo de uma venda:

1. O anunciante cria a conta em `app.qlareo.com/cadastro`. Ele vira um anunciante com o
   nome da empresa que digitou, e aparece em **Anunciantes** com o e-mail (via
   `public.operator_advertisers`, a única porta para `auth.users`, e só para operador).
2. Em **Campanhas › Nova campanha**: anunciante, nome, arte num lado ou frente e verso,
   link de destino e, se quiser, as datas. Nasce em "Aguardando arte".
3. Na campanha, marque os restaurantes: cada um ganha o próprio QR.
4. Baixe o **SVG** de cada QR e mande para a gráfica. O PNG (2048px) é para conferir.
5. Mude o status à mão conforme a campanha anda (em produção → em circulação → encerrada).

- **O destino muda sem reimprimir.** O QR leva ao `/r/<slug>`, não ao link do anunciante.
- **Tirar um restaurante** só é possível enquanto o QR não tem leitura: apagar a ligação
  apaga as leituras, e um QR lido já está impresso em alguma sacola.
- **O arquivo do QR** tem correção de erro Q (~25%, para papel amassado e mancha) e margem
  de 4 módulos. Na Vercel aponta sempre para `https://app.qlareo.com`, **inclusive no
  preview**: o preview usa o mesmo banco e fica atrás de login, e um QR dele mandado à
  gráfica levaria à tela de login da Vercel. Só no `npm run dev` aponta para a máquina.
- **Restaurantes** se cadastram em **Restaurantes**; não há exclusão (o banco recusa
  apagar restaurante com campanha).
- Não há conflito de lado para travar: cada sacola é de um anunciante só, e dois
  anunciantes no mesmo restaurante recebem lotes de sacola diferentes.

## QR codes (`/r/:slug`)

Cada restaurante de uma campanha tem o seu QR (`campaign_restaurants.slug`, 7 caracteres
gerados pelo banco, sem 0/o/1/l/i). O QR aponta para `https://app.qlareo.com/r/<slug>`,
que grava a leitura e redireciona para o destino da campanha.

- **302, nunca permanente.** Redirect permanente fica em cache no celular e a segunda
  leitura não passaria pelo servidor.
- **Uma chamada ao banco**, sem sessão: `public.record_scan` resolve o slug e grava. É a
  única coisa que o visitante anônimo consegue chamar; ele não lê tabela nenhuma.
- **Não conta:** prévias de link (WhatsApp, Instagram, Telegram…), buscadores, `curl` e
  pedidos `HEAD`. Eles são redirecionados, mas não viram leitura. Sem isso, cada vez que
  alguém mandasse o link numa conversa contaria uma leitura falsa.
- **Privacidade:** o banco não guarda IP nem user agent. `visitor_hash` é um SHA-256 de
  `SCAN_HASH_SECRET` + dia + IP + user agent. Dá para contar **pessoas únicas por dia**,
  mas não para voltar ao IP nem ligar a mesma pessoa entre dias. O dia vira à meia-noite de
  Brasília. Sem `SCAN_HASH_SECRET` em produção, o QR redireciona mas **não conta** (e loga
  o erro): contar sem segredo deixaria o IP recuperável.
- **Slug desconhecido** ou falha do banco levam para `qlareo.com`, não para uma página de
  erro.

**Links de e-mail** usam `token_hash` e caem em `/auth/confirmar`, então funcionam mesmo
abrindo o e-mail em outro aparelho. Os modelos estão em `web/supabase/templates/`. Em
produção eles saem pelo SMTP do Resend (`nao-responda@qlareo.com`), e o Auth inteiro
(modelos, SMTP, Site URL, redirects) é configurado pelo `[remotes.production]` do
`config.toml` com `npx supabase config push --remote=<ref>`. O push precisa de
`RESEND_API_KEY` no ambiente: é a senha do SMTP e não fica em arquivo nenhum.

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
