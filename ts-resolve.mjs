/**
 * Resolve hook nativo (node:module) — sem dependência externa.
 *
 * Os fontes (`ordersDataLayer.ts`, `reports.ts`) usam imports SEM extensão
 * (`from './ordersDataLayer'`), estilo bundler, porque quem os compila em
 * produção é o builder node da VTEX. O resolvedor ESM nativo do Node, porém,
 * exige extensão explícita. Este hook tenta a resolução normal e, se ela
 * falhar para um import relativo sem extensão, tenta de novo com `.ts`.
 *
 * Assim os testes rodam com o runner nativo (`node --test`) sobre os fontes
 * .ts reais, sem transpilar e sem alterar os imports (o que quebraria o build
 * da VTEX, que emite JS e não aceita extensões `.ts` sem allowImportingTsExtensions).
 */
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context)
  } catch (err) {
    const relativoSemExtensao =
      specifier.startsWith('.') && !/\.[cm]?[jt]s$/.test(specifier)
    if (!relativoSemExtensao) throw err

    try {
      // arquivo:    './core/money'   -> './core/money.ts'
      return await next(specifier + '.ts', context)
    } catch {
      // diretório:  './core'         -> './core/index.ts'
      return next(specifier + '/index.ts', context)
    }
  }
}
