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
2. `/r/:slug`: conta a leitura e redireciona.
3. Área do operador: anunciantes, restaurantes e campanhas.
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

As `NEXT_PUBLIC_` são embutidas no build: na Vercel, cadastre as duas antes do deploy.

O Supabase local usa a faixa de portas **553xx** (e não a 543xx padrão) para conviver com
outros projetos Supabase na mesma máquina. O Studio fica em http://127.0.0.1:55323 e os
e-mails de confirmação e de senha caem no Mailpit, em http://127.0.0.1:55324.

O seed (`supabase/seed.sql`) cria duas contas locais, com senha `qlareo123`:
`operador@qlareo.local` (operador) e `anunciante@exemplo.local` (Padaria Exemplo).
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

**Links de e-mail** usam `token_hash` e caem em `/auth/confirmar`, então funcionam mesmo
abrindo o e-mail em outro aparelho. Os modelos locais estão em `web/supabase/templates/`.
No projeto de produção, copie os mesmos textos em Auth › Email Templates, ligue "Confirm
email" e cadastre `https://app.qlareo.com` como Site URL.

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
