# Diário de bordo — QLAREO

Registro honesto do desenvolvimento. O produto nasceu como spin-off do app VTEX
IO [`vtex-sales-reports`](https://github.com/gustavohenriquepss/vtex-sales-reports).

## 2026-07-21 — Nascimento do repositório standalone

Decisão: o standalone vira **produto separado, em repo próprio** (não um modo do
app IO). O app IO segue VTEX-only e sem custódia de credencial; o QLAREO assume
a operação em troca de remover os tetos da plataforma.

### ✅ Deu certo

- **Fundação reaproveitada sem reescrever**: `core/` (agnóstico) e
  `adapters/vtex/` vieram prontos e testados da branch de refactor do app repo.
  Colados na raiz do QLAREO (espelhando a estrutura original) para não quebrar
  um único import — arquivos provados ficaram byte-idênticos.
- **A peça nova que define "standalone": `transport/fetchHttpClient.ts`** —
  implementa o seam `HttpClient` do adapter com `fetch` nativo e auth por
  appKey/appToken, no lugar da sessão do admin. O adapter e o core não
  perceberam a troca.
- **Servidor HTTP nativo** (sem framework), 4 rotas + `/health`, auth por
  `x-api-key`, config validada na subida. Costura de injeção de adapter permite
  testar o app inteiro por HTTP real em localhost com um adapter falso.
- **Verificação final**: `tsc --noEmit` limpo; **127 testes verdes** (106 da
  fundação + 7 do transporte + 6 de params + 8 do servidor e2e); o `demo`
  produz os mesmos números do app IO (R$ 950, ABC 80/95/100, recompra 50%,
  desconto R$ 130) — comportamento preservado através da nova fronteira.
- **`type: module` no package.json** eliminou o warning cosmético de "reparsing"
  que o app repo tinha — aqui não há builder VTEX ditando CommonJS.

### ❌ Deu errado / achados no caminho

- **Repeti a armadilha das parameter properties**: `VtexHttpError` com
  `constructor(public readonly status...)` estourou
  `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` sob type stripping. Campos explícitos
  resolvem. (Terceira vez que essa pegadinha aparece no projeto.)
- **`import.meta` não compila com `module: commonjs`.** Usei o guard
  `import.meta.url === argv[1]` em `main.ts` para "subir só quando executado
  direto". tsc reprovou (TS1343). Corrigido separando `server/start.ts` como
  entrypoint — melhor design: importar a app em teste não sobe socket, e some o
  `import.meta`.
- Deixei um `import` morto de `toMajor` no demo (guardado só para não acusar
  unused). Removido.

### ⚠️ Estado honesto (não esconder)

- **Sem banco e sem sync incremental ainda.** O MVP consulta a Orders API a cada
  requisição, igual ao app IO — então os tetos de 2.000 pedidos e de ~24 meses
  ainda valem na prática. A arquitetura está pronta para o banco; o ganho é
  roadmap, não estado atual. Declarado no README.
- **Nada validado contra a Orders API real.** O transporte foi testado só com
  `fetch` mockado. O primeiro contato real depende de credencial da loja.
- **Privacidade invertida**: ao ganhar banco, o QLAREO passa a custodiar
  credencial e dado pessoal de terceiro → operador LGPD. Documentado no README
  como decisão comercial consciente, não acidente de arquitetura.
