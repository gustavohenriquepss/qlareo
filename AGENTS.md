# Qlareo — contexto do produto

A Qlareo é uma **rede de mídia em sacolas de delivery**. Este repositório é o app
(`app.qlareo.com`). A landing (`qlareo.com`) fica em `gustavohenriquepss/qlareo-LP`.

- Restaurantes recebem sacolas de papel kraft impressas de graça.
- Anunciantes locais pagam 100% antecipado para aparecer nelas.
- Uma marca por sacola: arte num lado (R$ 2,00/sacola) ou frente e verso (+25%, R$ 2,50),
  mínimo de 1.000 sacolas/mês. No banco, `campaigns.sides` (`um_lado`, `frente_e_verso`).
  O preço mora na landing; os planos Impacto/Alcance não existem mais.
- Comida, bebida e app de delivery não anunciam na rede; o restaurante vê cada arte antes.
- Piloto em Itaboraí e Icaraí, Niterói (RJ).

Este repositório abriga o redirect dos QR codes (`/r/:slug`, com contagem de leituras) e
o painel do anunciante, onde ele acompanha as leituras e envia as artes. Stack: Next.js 16
em `web/` + Supabase (Postgres, Auth, Storage). A ordem das fatias está no `README.md`.

- **Isolamento é pela RLS.** O cadastro é aberto: toda tabela nova precisa de policy que
  passe pelo vínculo em `advertiser_members` (ou `private.is_operator()`), e de um caso
  em `web/tests/db/` tentando furar o isolamento com uma conta comum.
- O `proxy.ts` só desvia rotas; nunca use ele como checagem de permissão.
- A chave secreta do Supabase nunca entra no app, só nos testes de banco.

Antes de mudar algo, leia o `README.md`:

- `web/app/globals.css` e `web/components/Logo.tsx` são a fonte da verdade da marca e a
  landing copia os dois. Não renomeie nem mova; mudança de token desce para a landing.
- Não invente números (alcance, recall, conversão) e não mude preço sem o dono pedir.

A versão anterior (SaaS de relatórios para lojas VTEX) está na tag `legacy/relatorios-v1`.
Não traga aquele código de volta para o `main` como está.
