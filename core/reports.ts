/**
 * core/reports.ts
 * -----------------------------------------------------------------------------
 * Os relatórios, agregando sobre o MODELO CANÔNICO (`core/types.ts`).
 * Nada aqui conhece VTEX: o adapter da plataforma traduz para `CanonicalOrder`
 * e estas funções são as mesmas para qualquer origem de dados.
 *
 * Fluxo esperado no handler:
 *
 *   const raw     = await adapter.fetchOrders(range, opts)
 *   const scoped  = filterByScope(raw, opts.scope)
 *   const vendas  = salesByPeriod(scoped, 'day', opts.timezone)
 *   const clientes = newVsReturning(scoped)
 *   // relatórios com item precisam dos pedidos enriquecidos (o.items preenchido):
 *   const abc     = topProductsABC(withItems)
 *   const skus    = topSkus(withItems)
 *   const promo   = promoEffectiveness(withItems)
 *
 * Decisões travadas:
 *   - `topProductsABC` agrupa por `productId` (não `skuId`): P e M do mesmo
 *     produto contam numa linha só. Quem precisa da variação usa `topSkus`, que
 *     é o MESMO cálculo com outra chave (ver `rankItemsByRevenue`).
 *   - DINHEIRO: soma-se SEMPRE em unidade mínima INTEIRA dentro dos laços e
 *     converte-se com `toMajor()` só ao montar a saída. Converter dentro do laço
 *     (o que o código legado fazia) acumula erro de float.
 *   - Datas truncadas no fuso do relatório via `bucketKey()` de `./time`.
 *
 * A saída continua em unidade MAIOR (reais), com os mesmos nomes de campo que o
 * front (`react/utils/api.ts`) já consome.
 * -----------------------------------------------------------------------------
 */
import { type CanonicalItem, type CanonicalOrder } from './types'
import { type Grain, bucketKey, DEFAULT_TIMEZONE } from './time'
import { toMajor, round } from './money'

/** Sem `sellerName` no pedido, o relatório mostra este rótulo (como no legado). */
const SEM_SELLER = '—'

// ============================================================================
// 1. Vendas por período  (barato — só o cabeçalho do pedido)
// ============================================================================

export interface SalesRow {
  bucket: string       // 'YYYY-MM-DD' | 'YYYY-Www' | 'YYYY-MM'
  faturamento: number  // unidade maior (reais)
  pedidos: number
  ticketMedio: number  // unidade maior (reais)
}

export interface SalesReport {
  linhas: SalesRow[]
  totalFaturamento: number
  totalPedidos: number
  ticketMedioGeral: number
  porPagamento: Array<{ metodo: string; faturamento: number; pedidos: number }>
  porSeller: Array<{ seller: string; faturamento: number; pedidos: number }>
}

export function salesByPeriod(
  orders: CanonicalOrder[],
  grain: Grain = 'day',
  timezone: string = DEFAULT_TIMEZONE
): SalesReport {
  const currency = currencyOf(orders)

  const buckets = new Map<string, Acc>()
  const pgto = new Map<string, Acc>()
  const seller = new Map<string, Acc>()

  // acumulador em unidade MÍNIMA inteira — só vira decimal na montagem da saída
  let totalMinor = 0

  for (const o of orders) {
    totalMinor += o.totalMinor

    bump(buckets, bucketKey(o.createdAt, grain, timezone), o.totalMinor)

    if (o.paymentMethod) bump(pgto, o.paymentMethod, o.totalMinor)
    bump(seller, o.sellerName ?? SEM_SELLER, o.totalMinor)
  }

  const linhas: SalesRow[] = [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucket, v]) => ({
      bucket,
      faturamento: toMajor(v.minor, currency),
      pedidos: v.ped,
      ticketMedio: v.ped ? toMajor(v.minor / v.ped, currency) : 0,
    }))

  return {
    linhas,
    totalFaturamento: toMajor(totalMinor, currency),
    totalPedidos: orders.length,
    ticketMedioGeral: orders.length
      ? toMajor(totalMinor / orders.length, currency)
      : 0,
    porPagamento: [...sortedRows(pgto, currency)].map(({ key, ...rest }) => ({
      metodo: key,
      ...rest,
    })),
    porSeller: [...sortedRows(seller, currency)].map(({ key, ...rest }) => ({
      seller: key,
      ...rest,
    })),
  }
}

// ============================================================================
// 2. Top produtos e top SKUs + Curva ABC  (precisam de `o.items` preenchido)
// ============================================================================

/**
 * O que as duas linhas de ranking têm em comum. A CHAVE não está aqui: é o
 * único campo que difere entre agrupar por produto e agrupar por SKU, e é ela
 * que dá nome ao tipo de cada relatório.
 */
interface RankedRow {
  nome: string
  receita: number       // unidade maior (reais)
  quantidade: number
  pedidos: number       // em quantos pedidos apareceu
  classe: 'A' | 'B' | 'C'
  percentualAcumulado: number
}

export interface ProductRow extends RankedRow {
  productId: string
}

/**
 * Uma linha por VARIAÇÃO (tamanho/cor). Carrega `productId` além do `skuId`
 * porque a pergunta seguinte a "qual SKU vendeu" é sempre "de qual produto ele
 * é" — e, na planilha, é o `productId` que cruza com o ERP.
 */
export interface SkuRow extends RankedRow {
  skuId: string
  productId: string
}

/**
 * Ranking de itens por receita com curva ABC — o miolo que `topProductsABC` e
 * `topSkus` compartilham.
 *
 * Só a CHAVE de agrupamento muda entre os dois. A agregação, a ordenação e o
 * corte A/B/C são idênticos, e duplicá-los deixaria os dois relatórios livres
 * para divergir num arredondamento — dois números que não reconciliam custam a
 * confiança do lojista nos dois.
 *
 * ABC por RECEITA: ordena por faturamento, acumula, corta em A até 80%, B até
 * 95%, C o resto. O percentual acumulado sai dos INTEIROS em unidade mínima,
 * então não depende de arredondamento intermediário.
 *
 * `amostra` é o primeiro item visto do grupo — de onde o chamador tira o que
 * não está na chave (o `productId` quando a chave é o SKU).
 *
 * O NOME não sai da amostra: sai de `nomeDoGrupo`, que recebe todos os nomes
 * distintos do grupo. Agrupar por SKU dá um nome só, mas agrupar por produto
 * junta itens que têm nomes DIFERENTES (um por variação), e escolher "o
 * primeiro que apareceu" é escolher uma variação ao acaso — ver `nomeDoProduto`.
 */
function rankItemsByRevenue(
  ordersWithItems: CanonicalOrder[],
  keyOf: (item: CanonicalItem) => string,
  nomeDoGrupo: (nomes: string[]) => string = (nomes) => nomes[0] ?? ''
): Array<{ chave: string; amostra: CanonicalItem; row: RankedRow }> {
  const currency = currencyOf(ordersWithItems)

  const agg = new Map<
    string,
    {
      amostra: CanonicalItem
      // Set: nomes distintos, na ordem em que apareceram. A ordem importa —
      // é o fallback de `nomeDoProduto` quando não há prefixo comum.
      nomes: Set<string>
      receitaMinor: number
      qtd: number
      pedidos: Set<string>
    }
  >()

  for (const o of ordersWithItems) {
    for (const item of o.items ?? []) {
      const chave = keyOf(item)
      const cur =
        agg.get(chave) ??
        {
          amostra: item,
          nomes: new Set<string>(),
          receitaMinor: 0,
          qtd: 0,
          pedidos: new Set<string>(),
        }
      cur.nomes.add(item.name)
      cur.receitaMinor += item.unitPaidMinor * item.quantity
      cur.qtd += item.quantity
      cur.pedidos.add(o.orderId)
      agg.set(chave, cur)
    }
  }

  const ordered = [...agg.entries()].sort(
    (a, b) => b[1].receitaMinor - a[1].receitaMinor
  )
  const totalMinor = ordered.reduce((s, [, v]) => s + v.receitaMinor, 0)

  let acumuladoMinor = 0
  return ordered.map(([chave, v]) => {
    acumuladoMinor += v.receitaMinor
    const pct = totalMinor ? (acumuladoMinor / totalMinor) * 100 : 0
    return {
      chave,
      amostra: v.amostra,
      row: {
        nome: nomeDoGrupo([...v.nomes]),
        receita: toMajor(v.receitaMinor, currency),
        quantidade: v.qtd,
        pedidos: v.pedidos.size,
        classe: (pct <= 80 ? 'A' : pct <= 95 ? 'B' : 'C') as 'A' | 'B' | 'C',
        percentualAcumulado: round(pct),
      },
    }
  })
}

/**
 * Sobras de separador na ponta do prefixo comum: "Camiseta Dry Fit -" vira
 * "Camiseta Dry Fit". Só a PONTA — separador no meio do nome é nome.
 */
const SEPARADOR_FINAL = /[\s\-–—:;,/|+]+$/

/**
 * Nome de exibição de um PRODUTO a partir dos nomes das variações dele.
 *
 * O modelo canônico não tem nome de produto: `CanonicalItem.name` vem do
 * `items[].name` do Get Order da VTEX, que é o nome do SKU e JÁ INCLUI a
 * variação ("Tênis Runner Pro - 40"). Agrupando por `productId`, pegar o nome
 * do primeiro item do grupo rotula o produto inteiro com uma variação
 * arbitrária — a que por acaso apareceu primeiro no período consultado, o que
 * faz o rótulo MUDAR quando o filtro de data muda.
 *
 * Então derivamos: prefixo comum às variações, cortado em fronteira de PALAVRA.
 * A fronteira de palavra é o que impede o caso patológico do prefixo por
 * caractere — "... - 40" e "... - 41" compartilham o "4" e produziriam
 * "Tênis Runner Pro - 4".
 *
 * É heurística, e o fallback é deliberado nos dois extremos:
 *  - UMA variação só: devolve o nome inteiro. Com um SKU não dá para saber o
 *    que ali é variação, e chutar um corte estragaria o caso mais comum do
 *    lojista pequeno.
 *  - SEM prefixo comum (variação vem na frente, ou catálogo sem padrão):
 *    devolve o primeiro nome. Rótulo imperfeito é melhor que linha sem rótulo.
 *
 * Substituir isto por um nome de produto de verdade é possível: o Get Order traz
 * `itemMetadata.Items[]` com `Name` (produto) e `SkuName` (variação), correlato
 * por `Id`/`ProductId`. Não está implementado porque esse bloco vem vazio em
 * parte das contas/pedidos, e não dá para afirmar que ele serve sem ver o
 * payload de uma conta real. Quando vier: `CanonicalItem` ganha um
 * `productName?`, o adapter preenche, e aqui é só preferi-lo — esta função
 * continua sendo o fallback de quem não tiver o campo.
 */
function nomeDoProduto(nomes: string[]): string {
  const primeiro = nomes[0] ?? ''
  if (nomes.length < 2) return primeiro

  let comum = primeiro.split(/\s+/)
  for (const nome of nomes.slice(1)) {
    const tokens = nome.split(/\s+/)
    let i = 0
    while (i < comum.length && i < tokens.length && comum[i] === tokens[i]) i++
    comum = comum.slice(0, i)
    if (comum.length === 0) break
  }

  return comum.join(' ').replace(SEPARADOR_FINAL, '') || primeiro
}

/**
 * Ranking por PRODUTO: P e M do mesmo produto contam numa linha só. É a visão
 * de sortimento — o que comprar, o que descontinuar.
 *
 * Só o RÓTULO passa por `nomeDoProduto`; a agregação e o corte ABC são os
 * mesmos de `topSkus`, calculados em `rankItemsByRevenue`.
 */
export function topProductsABC(ordersWithItems: CanonicalOrder[]): ProductRow[] {
  return rankItemsByRevenue(
    ordersWithItems,
    (item) => item.productId,
    nomeDoProduto
  ).map(({ chave, row }) => ({ productId: chave, ...row }))
}

/**
 * Ranking por SKU: cada variação numa linha. É a visão de ESTOQUE — um produto
 * classe A pode esconder um tamanho encalhado e outro que vive em ruptura, e o
 * relatório de produto, por construção, soma os dois numa linha e apaga a
 * diferença.
 *
 * O nome vem do item da VTEX, que já descreve a variação ("Camiseta Preta - M").
 */
export function topSkus(ordersWithItems: CanonicalOrder[]): SkuRow[] {
  return rankItemsByRevenue(ordersWithItems, (item) => item.skuId).map(
    ({ chave, amostra, row }) => ({
      skuId: chave,
      productId: amostra.productId,
      ...row,
    })
  )
}

// ============================================================================
// 3. Novos vs. recorrentes  (barato)
// ============================================================================

export interface RetentionReport {
  novos: number
  recorrentes: number
  taxaRecompra: number   // recorrentes / total, em %
  aviso: string
}

/**
 * Classifica cada cliente do conjunto como novo ou recorrente: recorrente é
 * quem tem mais de um pedido na janela conhecida. Agrupa por `customerEmail`;
 * pedido sem e-mail não entra na classificação.
 *
 * Limite honesto: a API só enxerga ~24 meses. Quem comprou antes disso e voltou
 * agora aparece como "novo" por engano — o `aviso` declara isso no relatório.
 */
export function newVsReturning(orders: CanonicalOrder[]): RetentionReport {
  const pedidosPorCliente = new Map<string, number>()

  for (const o of orders) {
    const id = o.customerEmail
    if (!id) continue
    pedidosPorCliente.set(id, (pedidosPorCliente.get(id) ?? 0) + 1)
  }

  let novos = 0
  let recorrentes = 0
  for (const count of pedidosPorCliente.values()) {
    if (count > 1) recorrentes++
    else novos++
  }

  const total = novos + recorrentes
  return {
    novos,
    recorrentes,
    taxaRecompra: round(total ? (recorrentes / total) * 100 : 0),
    aviso:
      'Classificação baseada nos pedidos dos últimos ~24 meses disponíveis na ' +
      'API. Clientes cuja primeira compra é anterior a essa janela podem ' +
      'aparecer como "novos".',
  }
}

// ============================================================================
// 4. Efetividade de promoção  (precisa de `o.items` preenchido)
// ============================================================================

export interface PromoReport {
  pedidosComDesconto: number
  receitaBrutaSemDesconto: number  // reais, soma de unitListMinor
  receitaLiquida: number           // reais, soma do que foi pago
  descontoTotal: number            // reais
  percentualDescontoMedio: number
  observacao: string
}

/**
 * Recorte simples e confiável: desconto = preço "de" menos preço pago, somado no
 * período. Amarrar desconto a UMA promoção específica é ruído (várias promoções
 * incidem no mesmo item), então não tentamos isso aqui. E é RELATÓRIO de
 * efetividade — não detecção de anomalia.
 */
export function promoEffectiveness(ordersWithItems: CanonicalOrder[]): PromoReport {
  const currency = currencyOf(ordersWithItems)

  let brutaMinor = 0
  let liquidaMinor = 0
  let pedidosComDesconto = 0

  for (const o of ordersWithItems) {
    let descontoNoPedidoMinor = 0
    for (const item of o.items ?? []) {
      const deMinor = (item.unitListMinor ?? item.unitPaidMinor) * item.quantity
      const porMinor = item.unitPaidMinor * item.quantity
      brutaMinor += deMinor
      liquidaMinor += porMinor
      descontoNoPedidoMinor += deMinor - porMinor
    }
    // inteiro: qualquer diferença positiva é desconto de verdade, sem ruído de float
    if (descontoNoPedidoMinor > 0) pedidosComDesconto++
  }

  const descontoMinor = brutaMinor - liquidaMinor
  return {
    pedidosComDesconto,
    receitaBrutaSemDesconto: toMajor(brutaMinor, currency),
    receitaLiquida: toMajor(liquidaMinor, currency),
    descontoTotal: toMajor(descontoMinor, currency),
    percentualDescontoMedio: round(
      brutaMinor ? (descontoMinor / brutaMinor) * 100 : 0
    ),
    observacao:
      'Desconto agregado por diferença entre preço de lista e preço pago. ' +
      'Não atribui desconto a promoções individuais (várias podem incidir ' +
      'no mesmo item).',
  }
}

// ============================================================================
// 5. Pedidos cancelados  (barato — só o cabeçalho do pedido)
// ============================================================================

export interface CanceledRow {
  bucket: string   // 'YYYY-MM-DD' | 'YYYY-Www' | 'YYYY-MM'
  pedidos: number
  valor: number    // unidade maior (reais)
}

export interface CanceledReport {
  /** Quantos pedidos cancelados no período. */
  totalPedidos: number
  /**
   * Soma dos cancelados, em reais. NUNCA chamado de "faturamento": este dinheiro
   * não entrou, e um campo com aquele nome acabaria somado ao relatório de
   * vendas por alguém montando uma planilha.
   */
  valorCancelado: number
  /** Denominador da taxa: TODOS os pedidos do período, de qualquer status. */
  pedidosNoPeriodo: number
  /** cancelados / pedidosNoPeriodo, em %. */
  taxa: number
  linhas: CanceledRow[]
  /**
   * Quebra pelo status CRU da plataforma. É o que separa 'canceled' (concluído)
   * de 'cancellation-requested' (em curso) — dois estados que pedem ações
   * diferentes e que o status canônico, por construção, funde num só.
   */
  porStatus: Array<{ status: string; pedidos: number; valor: number }>
  /** Um meio de pagamento concentrando cancelamento é problema de gateway. */
  porPagamento: Array<{ metodo: string; pedidos: number; valor: number }>
}

/**
 * Cancelamentos do período: quanto, quando, de que tipo e por qual pagamento.
 *
 * RECEBE O CONJUNTO COMPLETO, sem `filterByScope` — e é a única função deste
 * arquivo que exige isso. O motivo é estrutural: `liquido` (o recorte default da
 * interface) existe justamente para REMOVER cancelados, então filtrar antes
 * devolveria zero sempre. E a taxa precisa do total de pedidos do período como
 * denominador, que um conjunto já filtrado não tem mais como informar.
 *
 * O recorte acontece aqui dentro, por `status === 'canceled'`.
 */
export function canceledOrders(
  orders: CanonicalOrder[],
  grain: Grain = 'day',
  timezone: string = DEFAULT_TIMEZONE
): CanceledReport {
  const currency = currencyOf(orders)
  const cancelados = orders.filter((o) => o.status === 'canceled')

  const buckets = new Map<string, Acc>()
  const status = new Map<string, Acc>()
  const pgto = new Map<string, Acc>()

  let totalMinor = 0

  for (const o of cancelados) {
    totalMinor += o.totalMinor
    bump(buckets, bucketKey(o.createdAt, grain, timezone), o.totalMinor)
    bump(status, o.rawStatus, o.totalMinor)
    if (o.paymentMethod) bump(pgto, o.paymentMethod, o.totalMinor)
  }

  // `sortedRows` devolve a chave em `faturamento` porque nasceu no relatório de
  // vendas. Aqui o campo é renomeado para `valor` na saída — mesmo cálculo,
  // outro significado, e o nome tem de dizer qual dos dois é.
  const comValor = (m: Map<string, Acc>) =>
    sortedRows(m, currency).map(({ key, faturamento, pedidos }) => ({
      key,
      valor: faturamento,
      pedidos,
    }))

  return {
    totalPedidos: cancelados.length,
    valorCancelado: toMajor(totalMinor, currency),
    pedidosNoPeriodo: orders.length,
    taxa: round(orders.length ? (cancelados.length / orders.length) * 100 : 0),
    linhas: [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([bucket, v]) => ({
        bucket,
        pedidos: v.ped,
        valor: toMajor(v.minor, currency),
      })),
    porStatus: comValor(status).map(({ key, ...rest }) => ({
      status: key,
      ...rest,
    })),
    porPagamento: comValor(pgto).map(({ key, ...rest }) => ({
      metodo: key,
      ...rest,
    })),
  }
}

// ============================================================================
// 6. Vendas por região (UF)   |   7. Cupons e origem (UTM)
//    Os dois precisam do pedido ENRIQUECIDO — os campos vêm do Get Order.
// ============================================================================

/** Rótulo do que não tem UF informada. */
const SEM_REGIAO = 'Sem UF informada'
/** Rótulo de quem comprou sem cupom. NÃO é ausência de dado — é um resultado. */
const SEM_CUPOM = 'Sem cupom'
/** Rótulo de quem chegou sem UTM: tráfego direto, orgânico ou não rastreado. */
const SEM_ORIGEM = 'Direto / não rastreado'

export interface RegionRow {
  uf: string
  faturamento: number
  pedidos: number
  ticketMedio: number
  /** Fatia do faturamento do período, em %. */
  participacao: number
}

export interface RegionReport {
  linhas: RegionRow[]
  totalFaturamento: number
  totalPedidos: number
  /**
   * Quantos pedidos do conjunto NÃO têm UF. Fica separado do total para que a
   * tela possa dizer "sobre 940 de 1.000 pedidos" em vez de fingir cobertura
   * completa — pedido digital e retirada em loja legitimamente não têm UF.
   */
  pedidosSemRegiao: number
}

/**
 * Faturamento por UF de entrega.
 *
 * Agrupa pelo que veio do endereço de ENTREGA, não de cobrança: a pergunta é
 * "para onde estou vendendo" (frete, estoque, campanha regional), e num presente
 * as duas respostas divergem.
 *
 * Pedido sem UF entra numa linha própria em vez de ser descartado — descartar
 * faria a soma das linhas não bater com o faturamento do período, e o lojista
 * perderia a confiança nos dois números.
 */
export function salesByRegion(
  ordersWithDetail: CanonicalOrder[]
): RegionReport {
  // Sem `grain` nem `timezone`: o agrupamento é geográfico, e a janela de datas
  // já foi aplicada na consulta ao store.
  const currency = currencyOf(ordersWithDetail)

  const ufs = new Map<string, Acc>()
  let totalMinor = 0
  let semRegiao = 0

  for (const o of ordersWithDetail) {
    totalMinor += o.totalMinor
    if (!o.shippingState) semRegiao++
    bump(ufs, o.shippingState ?? SEM_REGIAO, o.totalMinor)
  }

  return {
    linhas: sortedRows(ufs, currency).map(({ key, faturamento, pedidos }) => ({
      uf: key,
      faturamento,
      pedidos,
      ticketMedio: pedidos ? round(faturamento / pedidos) : 0,
      participacao: round(
        totalMinor ? (faturamento / toMajor(totalMinor, currency)) * 100 : 0
      ),
    })),
    totalFaturamento: toMajor(totalMinor, currency),
    totalPedidos: ordersWithDetail.length,
    pedidosSemRegiao: semRegiao,
  }
}

export interface AttributionRow {
  chave: string
  faturamento: number
  pedidos: number
  participacao: number
}

export interface AttributionReport {
  porCupom: AttributionRow[]
  porOrigem: AttributionRow[]
  porCampanha: AttributionRow[]
  totalFaturamento: number
  totalPedidos: number
  /** Pedidos que usaram algum cupom. */
  pedidosComCupom: number
  /** Faturamento que passou por cupom. */
  faturamentoComCupom: number
  observacao: string
}

/**
 * Cupons e origem de tráfego.
 *
 * Complementa `promoEffectiveness`, que sabe QUANTO de desconto foi dado mas não
 * POR QUÊ: aqui o desconto ganha um nome (o cupom) e uma origem (a campanha).
 *
 * "Sem cupom" e "Direto / não rastreado" são LINHAS, não buracos. É a diferença
 * que define a leitura do relatório: numa loja saudável a maior linha costuma
 * ser justamente "sem cupom", e omiti-la faria a segunda maior parecer dominante.
 * Também é o que impede o erro de ler ausência de UTM como falha de sincronismo
 * — a maioria dos pedidos legitimamente não tem UTM nenhuma.
 */
export function couponsAndSources(
  ordersWithDetail: CanonicalOrder[]
): AttributionReport {
  const currency = currencyOf(ordersWithDetail)

  const cupons = new Map<string, Acc>()
  const origens = new Map<string, Acc>()
  const campanhas = new Map<string, Acc>()

  let totalMinor = 0
  let comCupomMinor = 0
  let pedidosComCupom = 0

  for (const o of ordersWithDetail) {
    totalMinor += o.totalMinor
    if (o.coupon) {
      pedidosComCupom++
      comCupomMinor += o.totalMinor
    }
    bump(cupons, o.coupon ?? SEM_CUPOM, o.totalMinor)
    bump(origens, o.utmSource ?? SEM_ORIGEM, o.totalMinor)
    bump(campanhas, o.utmCampaign ?? SEM_ORIGEM, o.totalMinor)
  }

  const totalMajor = toMajor(totalMinor, currency)
  const linhas = (m: Map<string, Acc>): AttributionRow[] =>
    sortedRows(m, currency).map(({ key, faturamento, pedidos }) => ({
      chave: key,
      faturamento,
      pedidos,
      participacao: round(totalMajor ? (faturamento / totalMajor) * 100 : 0),
    }))

  return {
    porCupom: linhas(cupons),
    porOrigem: linhas(origens),
    porCampanha: linhas(campanhas),
    totalFaturamento: totalMajor,
    totalPedidos: ordersWithDetail.length,
    pedidosComCupom,
    faturamentoComCupom: toMajor(comCupomMinor, currency),
    observacao:
      'Atribuição por último clique, como a VTEX registra no pedido. Um pedido ' +
      'tem no máximo um cupom e uma campanha — não há rateio entre origens.',
  }
}

// ============================================================================
// Helpers internos
// ============================================================================

interface Acc {
  minor: number
  ped: number
}

/**
 * O core não converte moeda — só não mistura. Como todo o conjunto vem de uma
 * loja, basta a moeda do primeiro pedido para saber quantas casas decimais usar
 * na saída.
 */
function currencyOf(orders: CanonicalOrder[]): string {
  return orders[0]?.currency ?? 'BRL'
}

function bump(m: Map<string, Acc>, k: string, minor: number): void {
  const cur = m.get(k) ?? { minor: 0, ped: 0 }
  cur.minor += minor
  cur.ped += 1
  m.set(k, cur)
}

function sortedRows(
  m: Map<string, Acc>,
  currency: string
): Array<{ key: string; faturamento: number; pedidos: number }> {
  return [...m.entries()]
    .sort((a, b) => b[1].minor - a[1].minor)
    .map(([key, v]) => ({
      key,
      faturamento: toMajor(v.minor, currency),
      pedidos: v.ped,
    }))
}
