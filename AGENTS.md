# Qlareo — contexto do produto

A Qlareo é uma **rede de mídia em sacolas de delivery**. Este repositório é o app
(`app.qlareo.com`). A landing (`qlareo.com`) fica em `gustavohenriquepss/qlareo-LP`.

- Restaurantes recebem sacolas de papel kraft impressas de graça.
- Anunciantes locais pagam 100% antecipado para aparecer nelas.
- Dois planos: **Impacto** (1 anunciante, frente e verso; id `exclusiva`) e **Alcance**
  (1 anunciante por lado; id `meia`).
- Comida, bebida e app de delivery não anunciam na rede; o restaurante vê cada arte antes.
- Piloto em Itaboraí e Icaraí, Niterói (RJ).

Este repositório vai abrigar o redirect dos QR codes (`/r/:slug`, com contagem de
leituras) e o painel do anunciante. Nenhum dos dois existe ainda: `web/` é só a base
Next.js com o design system.

Antes de mudar algo, leia o `README.md`:

- `web/app/globals.css` e `web/components/Logo.tsx` são a fonte da verdade da marca e a
  landing copia os dois. Não renomeie nem mova; mudança de token desce para a landing.
- Não invente números (alcance, recall, conversão) e não mude preço sem o dono pedir.

A versão anterior (SaaS de relatórios para lojas VTEX) está na tag `legacy/relatorios-v1`.
Não traga aquele código de volta para o `main` como está.
