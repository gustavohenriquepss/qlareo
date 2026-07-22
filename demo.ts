/**
 * demo.ts — QLAREO rodando o pipeline inteiro sobre pedidos SINTÉTICOS.
 *
 * Mesmo caminho de produção (formato cru da VTEX → adapter → core), mas sem
 * rede: prova o motor de relatórios sem precisar de conta VTEX nem credencial.
 *
 *   npm run demo
 */
import { mapVtexOrder, type VtexOrderSummary } from './adapters/vtex'
import {
  filterByScope,
  newVsReturning,
  promoEffectiveness,
  salesByPeriod,
  topProductsABC,
} from './core'

const rawOrders: VtexOrderSummary[] = [
  { orderId: 'o1', creationDate: '2026-01-15T12:00:00Z', status: 'invoiced', value: 40000, paymentNames: 'Visa', sellerNames: ['loja-principal'], clientEmail: 'ana@example.com',
    items: [{ id: 'sku-camiseta-P', productId: 'prod-camiseta', name: 'Camiseta Básica', quantity: 1, price: 40000, listPrice: 50000 }] },
  { orderId: 'o2', creationDate: '2026-01-16T01:00:00Z', status: 'invoiced', value: 15000, paymentNames: 'Pix', sellerNames: ['loja-principal'], clientEmail: 'ana@example.com',
    items: [{ id: 'sku-calca', productId: 'prod-calca', name: 'Calça Jeans', quantity: 2, price: 7500, listPrice: 7500 }] },
  { orderId: 'o3', creationDate: '2026-01-16T12:00:00Z', status: 'aguardando-conferencia-fiscal', value: 40000, paymentNames: 'Visa', sellerNames: ['seller-parceiro'], clientEmail: 'bruno@example.com',
    items: [
      { id: 'sku-camiseta-M', productId: 'prod-camiseta', name: 'Camiseta Básica', quantity: 1, price: 40000, listPrice: 40000 },
      { id: 'sku-meia', productId: 'prod-meia', name: 'Meia Esportiva', quantity: 2, price: 2500, listPrice: 4000 },
    ] },
  { orderId: 'o4', creationDate: '2026-01-16T15:00:00Z', status: 'canceled', value: 99900, paymentNames: 'Boleto', sellerNames: ['loja-principal'], clientEmail: 'carla@example.com', items: [] },
  { orderId: 'o5', creationDate: '2026-01-16T16:00:00Z', status: 'payment-pending', value: 12300, paymentNames: 'Pix', sellerNames: ['loja-principal'], clientEmail: 'diego@example.com', items: [] },
]

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const line = (s: string) => console.log(s)
const rule = () => line('─'.repeat(70))

line('\n  QLAREO — demo do motor de relatórios (dados sintéticos, sem VTEX)\n')
const orders = rawOrders.map(mapVtexOrder)
const scoped = filterByScope(orders, 'liquido')
line(`Adapter + recorte líquido: ${rawOrders.length} pedidos crus → ${scoped.length} contam como venda`)
line('  (fora: o4 canceled, o5 pending; o3 tinha status customizado → mapeado como "paid")')

rule(); line('VENDAS POR PERÍODO'); rule()
const v = salesByPeriod(scoped, 'day')
line(`  ${brl(v.totalFaturamento)}  |  ${v.totalPedidos} pedidos  |  ticket ${brl(v.ticketMedioGeral)}`)
for (const l of v.linhas) line(`    ${l.bucket}  ${brl(l.faturamento)}  (${l.pedidos} ped)`)

rule(); line('TOP PRODUTOS (ABC)'); rule()
for (const p of topProductsABC(scoped)) line(`    [${p.classe}] ${p.nome.padEnd(16)} ${brl(p.receita)}  (acum ${p.percentualAcumulado}%)`)

rule(); line('NOVOS vs. RECORRENTES'); rule()
const c = newVsReturning(scoped)
line(`    novos ${c.novos}  |  recorrentes ${c.recorrentes}  |  recompra ${c.taxaRecompra}%`)

rule(); line('PROMOÇÕES'); rule()
const p = promoEffectiveness(scoped)
line(`    desconto ${brl(p.descontoTotal)}  |  médio ${p.percentualDescontoMedio}%  |  ${p.pedidosComDesconto} pedidos com desconto`)
line('')
