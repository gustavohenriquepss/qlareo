# Deploy

Duas peças separadas: o **front-end** (`web/`) na Vercel e o **backend**
(raiz do projeto) no Render.

## Front-end (`web/`) — Vercel

- **Root Directory**: `web`
- **Framework Preset**: Next.js
- **Environment Variables** (Production **e** Preview):
  - `QLAREO_API_URL` — URL pública do backend (nunca `localhost`)
  - `QLAREO_API_KEY` — mesma chave configurada no backend, **sem** prefixo
    `NEXT_PUBLIC_` (senão vaza pro browser)

Sem essas duas variáveis, a tela mostra "Não foi possível falar com o serviço
QLAREO" (cai no fallback `http://localhost:3000` de `web/lib/api.ts`).

## Backend (raiz) — Render

- **Root Directory**: em branco (a raiz do repo, não `web/`)
- **Build Command**: `npm install`
- **Start Command**: ver abaixo — muda conforme a fase
- **Instance Type**: Free

### Fase 1 — sem cliente VTEX ainda (dados fake)

Start Command: `npm run seed`

Sobe a API sobre 120 dias de pedidos sintéticos determinísticos (loja
`lojademo`), sem precisar de VTEX nem Postgres — ver
[`scripts/seed-dev-server.ts`](scripts/seed-dev-server.ts). Lê `PORT` e
`QLAREO_API_KEY` do ambiente (necessário pro Render, que injeta a porta
dinamicamente); as credenciais VTEX são fixas/fake e **não** vêm do ambiente
nesse modo.

Env vars nessa fase:
```
QLAREO_API_KEY=<a mesma chave que você colocou na Vercel>
```

### Fase 2 — com cliente VTEX real

Trocar o Start Command de volta para: `npm start`

Esse comando usa [`server/start.ts`](server/start.ts) → `loadConfig()`, que
**exige** as credenciais reais (falha alto e cedo se faltar alguma).

Env vars nessa fase:
```
VTEX_ACCOUNT=<subdomínio da conta>
VTEX_APP_KEY=<gerada no Admin VTEX, papel "OMS - View order">
VTEX_APP_TOKEN=<gerada no Admin VTEX, papel "OMS - View order">
QLAREO_API_KEY=<mesma chave da Vercel>
DATABASE_URL=<opcional — sem ela, store em memória, some a cada restart>
```

Com `DATABASE_URL` configurada (ex: Neon, free tier permanente — o Postgres
free do Render expira), rodar antes de subir o servidor:
```bash
npm run migrate
npm run sync -- --from=YYYY-MM-DD --to=YYYY-MM-DD --items
```

Ver a seção "Credenciais" do [README.md](README.md) para a tabela completa de
variáveis e o que cada uma faz.

## Free tier — o que saber

- **Render (backend)**: free tier "dorme" após ~15 min sem tráfego; primeira
  requisição depois disso demora 30-50s pra acordar. Aceitável pra uso
  interno/baixo tráfego.
- **Render Postgres**: free expira depois de um tempo (não é permanente) — por
  isso a recomendação de usar **Neon** para o banco em produção.
- **Vercel (front-end)**: Hobby plan free é suficiente para esse volume.
