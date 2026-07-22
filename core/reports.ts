/**
 * core/reports.ts
 * -----------------------------------------------------------------------------
 * Os 4 relatórios, agora agregando sobre o MODELO CANÔNICO (`core/types.ts`).
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
 *   const promo   = promoEffectiveness(withItems)
 *
 * Decisões travadas:
 *   - Agrupar produto por `productId` (não `skuId`): P e M do mesmo produto
 *     contam numa linha só.
 *   - DINHEIRO: soma-se SEMPRE em unidade mínima INTEIRA dentro dos laços e
 *     converte-se com `toMajor()` só ao montar a saída. Converter dentro do laço
 *     (o que o código legado fazia) acumula erro de float.
 *   - Datas truncadas no fuso do relatório via `bucketKey()` de `./time`.
 *
 * A saída continua em unidade MAIOR (reais), com os mesmos nomes de campo que o
 * front (`react/utils/api.ts`) já consome.
 * -----------------------------------------------------------------------------
 */
import { type CanonicalOrder } from './types'
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
// 2. Top produtos + Curva ABC  (precisa de `o.items` preenchido)
// ============================================================================

export interface ProductRow {
  productId: string
  nome: string
  receita: number       // unidade maior (reais)
  quantidade: number
  pedidos: number       // em quantos pedidos apareceu
  classe: 'A' | 'B' | 'C'
  percentualAcumulado: number
}

/**
 * ABC por RECEITA. Ordena produtos por faturamento, acumula, e corta:
 * A até 80%, B até 95%, C o resto. Agrupa por `productId`.
 *
 * O percentual acumulado é calculado sobre os INTEIROS em unidade mínima, então
 * não depende de arredondamento intermediário.
 */
export function topProductsABC(ordersWithItems: CanonicalOrder[]): ProductRow[] {
  const currency = currencyOf(ordersWithItems)

  const agg = new Map<
    string,
    { nome: string; receitaMinor: number; qtd: number; pedidos: Set<string> }
  >()

  for (const o of ordersWithItems) {
    for (const item of o.items ?? []) {
      const cur =
        agg.get(item.productId) ??
        { nome: item.name, receitaMinor: 0, qtd: 0, pedidos: new Set<string>() }
      cur.receitaMinor += item.unitPaidMinor * item.quantity
      cur.qtd += item.quantity
      cur.pedidos.add(o.orderId)
      agg.set(item.productId, cur)
    }
  }

  const ordered = [...agg.entries()].sort(
    (a, b) => b[1].receitaMinor - a[1].receitaMinor
  )
  const totalMinor = ordered.reduce((s, [, v]) => s + v.receitaMinor, 0)

  let acumuladoMinor = 0
  return ordered.map(([productId, v]) => {
    acumuladoMinor += v.receitaMinor
    const pct = totalMinor ? (acumuladoMinor / totalMinor) * 100 : 0
    return {
      productId,
      nome: v.nome,
      receita: toMajor(v.receitaMinor, currency),
      quantidade: v.qtd,
      pedidos: v.pedidos.size,
      classe: (pct <= 80 ? 'A' : pct <= 95 ? 'B' : 'C') as 'A' | 'B' | 'C',
      percentualAcumulado: round(pct),
    }
  })
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
