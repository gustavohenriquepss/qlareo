# ADR 0003 — Onde mora a chave de criptografia

- **Status:** aceito
- **Data:** 2026-07-31
- **Issue:** [GUS-51](https://linear.app/padeiro/issue/GUS-51/03-adr-onde-mora-a-chave-de-criptografia)
- **Bloqueia:** Fase 4 (GUS-47), em particular GUS-72 (4.1) e GUS-76 (4.5)
- **Depende de:** [ADR 0002](./0002-contrato-app-sync.md) — que já decidiu *quem* descriptografa

## Contexto

O Qlareo passa a custodiar appKey/appToken de VTEX de terceiros. O README já registra que
isso inverte a postura de privacidade do produto e faz do Qlareo operador LGPD; este ADR
decide o mecanismo que sustenta essa responsabilidade.

**Há dois consumidores, e isso não é negociável.** O [ADR 0002](./0002-contrato-app-sync.md)
decidiu que o job de sync **não carrega credencial** — o worker resolve `store_account` →
`vtex_accounts` e descriptografa no consumo. Então:

| Consumidor | Onde roda | Precisa descriptografar? |
|---|---|---|
| App Next | Vercel | Sim — validar credencial no onboarding (4.2) |
| Worker de sync | Lambda (alvo) | Sim — montar o adapter a cada job |

Qualquer desenho em que só um dos dois consegue descriptografar está descartado de saída.

Outras restrições do ambiente:

- **Postgres gerenciado neutro**, operado por um terceiro (Neon/RDS/Railway).
- **A única SQL do projeto vive em `store/postgres/postgresOrderStore.ts`** — invariante que
  a issue 1.3 transforma em grep de guarda no CI.
- O worker vai para Lambda — alvo **confirmado**, não hipótese. A AWS já está no desenho,
  então o KMS não introduz fornecedor novo.

## Opções

### A. pgcrypto, com a chave num secret manager

`pgp_sym_encrypt(dado, chave)` na própria query; a chave vem de um secret manager para a
aplicação e é passada ao Postgres a cada chamada.

**Descartada.** Dois motivos, e o primeiro é suficiente:

1. **A chave viaja dentro do texto da query.** Ela aparece em `pg_stat_statements`, em log
   de query lenta, em qualquer captura de diagnóstico do provedor gerenciado. Pior: o
   banco vê a chave *e* o texto em claro. Como o Postgres é operado por um terceiro, isso
   entrega ao mesmo terceiro o cofre e a chave do cofre — que é exatamente a separação que
   um cofre de credenciais existe para manter.
2. Colocaria criptografia dentro de SQL, espalhando expressões `pgp_sym_*` por caminhos que
   hoje não têm SQL nenhum, contra a invariante da 1.3.

### B. KMS + envelope encryption

A aplicação gera uma **DEK** (chave de dados) por conta, cifra a credencial localmente com
AES-256-GCM (`node:crypto`), e cifra a DEK com a **KEK** que vive no KMS. O banco guarda
ciphertext e DEK embrulhada — nunca a chave, nunca o texto em claro.

**Escolhida.**

## Decisão

**Envelope encryption com AWS KMS**, atrás de uma porta `CredentialCipher` com duas
implementações: KMS (preview/prod) e chave local (dev).

### Como os dois consumidores alcançam a chave

Este é o ponto que torna a opção B viável, e não apenas preferível:

- **Worker (Lambda):** a execution role tem `kms:Decrypt` e `kms:GenerateDataKey` na chave.
  Credencial de curta duração fornecida pelo próprio runtime. Nada a configurar.
- **App Next (Vercel):** federação OIDC da Vercel para uma role IAM, via
  `awsCredentialsProvider({ roleArn })` do pacote `@vercel/oidc-aws-credentials-provider`.
  **Nenhuma chave de acesso AWS de longa duração é armazenada na Vercel** — o token OIDC é
  trocado por credencial temporária no STS a cada invocação.

A alternativa — uma chave simétrica compartilhada num secret manager — exigiria copiar o
mesmo segredo para o ambiente da Vercel e para o da Lambda, e rotacioná-lo nos dois em
sincronia. Duas cópias de um segredo de longa duração em dois provedores é pior que zero
cópias.

### O que a linha de `vtex_accounts` guarda

| Coluna | Conteúdo |
|---|---|
| `app_key_ciphertext`, `app_token_ciphertext` | `BYTEA` — AES-256-GCM sob a DEK, com o IV e a tag de autenticação |
| `dek_wrapped` | `BYTEA` — a DEK cifrada pela KEK do KMS |
| `kek_alias` | qual chave do KMS embrulhou esta DEK |
| `key_version` | `INT`, para varredura de re-embrulho |

GCM e não CBC: a tag de autenticação faz adulteração de ciphertext virar erro de
descriptografia, não texto lixo aceito silenciosamente.

### Rotação sem reescrever todas as linhas

Três cenários, com custos diferentes:

1. **Rotação automática da KEK (rotina, anual).** O KMS retém o material de chave antigo e
   `Decrypt` não exige indicar a versão. As linhas existentes continuam legíveis **sem
   tocar em nenhuma delas**. Custo: zero.
2. **Rotação para uma KEK nova (suspeita de comprometimento, troca de alias).** Re-embrulha
   apenas `dek_wrapped`: um `Decrypt` + um `Encrypt` por conta, atualizando uma coluna
   pequena. **`app_key_ciphertext` e `app_token_ciphertext` não são tocados** — que é
   precisamente o ganho do envelope. `key_version` marca o que falta, então a varredura é
   retomável e pode rodar em lotes.
3. **Rotação da DEK de uma conta.** Exige re-cifrar aquela credencial — mas é uma linha, e
   acontece naturalmente na próxima atualização de credencial do lojista.

O caso caro (reescrever todo o ciphertext) só ocorre se o algoritmo mudar, não em rotação
de chave.

### Perda da chave

**Se a KEK do KMS for apagada, as credenciais são irrecuperáveis. Não há backup possível
que não anule o mecanismo** — guardar a DEK desembrulhada "por segurança" seria reintroduzir
a chave em claro no banco.

Consequência, por escrito:

- **Re-onboarding de todas as lojas.** Cada lojista precisa gerar/reinformar appKey e
  appToken. A UI de 4.3 já cobre esse fluxo, então o caminho existe — o custo é comercial
  (pedir a N clientes que refaçam uma etapa), não técnico.
- **Os dados de pedido não se perdem.** `orders`, `order_items` e `sync_state` não são
  cifrados. Os relatórios continuam respondendo sobre o histórico já sincronizado; o que
  para é o sync novo, até a credencial voltar. O raio do desastre é a credencial, não o
  produto.

Mitigações, todas baratas: janela obrigatória de espera do KMS para deleção (7–30 dias),
proteção contra deleção habilitada na chave, e alarme em `ScheduleKeyDeletion` no
CloudTrail. Uma chave separada por ambiente garante que apagar a de preview não toca prod.

### Nome do segredo e configuração por ambiente

| Variável | dev | preview | prod |
|---|---|---|---|
| `QLAREO_KMS_KEY_ID` | — | `alias/qlareo-vtex-credentials-preview` | `alias/qlareo-vtex-credentials` |
| `AWS_ROLE_ARN` | — | role de preview | role de produção |
| `AWS_REGION` | — | definido explicitamente | definido explicitamente |
| `QLAREO_DEV_ENCRYPTION_KEY` | 32 bytes em base64, no `.env` | — | — |

- **dev** não fala com a AWS. `QLAREO_DEV_ENCRYPTION_KEY` alimenta a implementação local da
  porta, com o mesmo formato de coluna — o código não ramifica além da fábrica. É o mesmo
  padrão que `store/factory.ts` já usa (`DATABASE_URL` presente → Postgres, ausente →
  memória), e mantém `docker compose up` suficiente para desenvolver.
- **preview** usa chave própria: um deploy de preview nunca descriptografa credencial de
  produção, mesmo apontando para um dump.
- **prod**: variáveis no projeto da Vercel; na Lambda, `QLAREO_KMS_KEY_ID` e a execution
  role.

Nenhuma dessas variáveis é `NEXT_PUBLIC_*`, e a implementação local **falha na subida** se
detectar `QLAREO_DEV_ENCRYPTION_KEY` fora de dev — senão a rota fácil vira a insegura.

## Consequências

**Positivas**

- O banco nunca vê chave nem texto em claro; o provedor gerenciado do Postgres deixa de
  ser parte da superfície de confiança do cofre.
- Zero segredo AWS de longa duração na Vercel, graças ao OIDC.
- Rotação de rotina custa zero linhas reescritas; a de emergência toca uma coluna pequena.
- Criptografia fica em TypeScript atrás de uma porta, testável com implementação falsa,
  sem SQL novo.
- Nenhum vendor novo: a AWS já entra pelo worker.

**Negativas**

- Amarra o projeto à AWS para criptografia. Sair significa reescrever a implementação da
  porta e re-embrulhar todas as DEKs (não re-cifrar as credenciais — o envelope limita o
  estrago).
- Uma chamada ao KMS por job de sync e por validação de credencial: latência de dezenas de
  ms e custo por request. Cache da DEK desembrulhada em memória do processo é possível,
  mas **fica fora deste ADR** — cache de segredo tem seu próprio risco e merece decisão
  própria.
- Mais peças para configurar antes do primeiro deploy: role IAM, política de confiança OIDC,
  chave e alias.
- A implementação local de dev é código que existe só para dev, e precisa de teste que
  garanta que ela nunca sobe em produção.

**Gatilhos de revisão**

- Se o worker sair da Lambda para um runtime fora da AWS, reavaliar — o argumento do "nenhum
  vendor novo" cai.
- Se a latência do KMS aparecer no p95 do onboarding, aí sim decidir cache de DEK, em ADR
  próprio.
- Se um cliente exigir chave gerenciada por ele (BYOK), o envelope já é a estrutura certa:
  muda a KEK por tenant, não o formato das colunas.

## Fontes

- [Vercel — OIDC Federation with AWS](https://vercel.com/docs/oidc/aws) (consultado em 2026-07-31)
- [Vercel — `awsCredentialsProvider`](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package)
