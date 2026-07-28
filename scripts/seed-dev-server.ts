/**
 * scripts/seed-dev-server.ts — servidor de desenvolvimento com dados falsos
 * (npm run seed).
 * -----------------------------------------------------------------------------
 * Sobe a API sobre um store em memória já populado com 120 dias de pedidos
 * gerados. Serve para rodar o front-end (`web/`) sem VTEX nem Postgres: os
 * relatórios têm volume, sazonalidade e descontos suficientes para exercitar
 * gráficos, rankings e filtros.
 *
 * Os dados são determinísticos (PRNG com semente fixa), então a "loja" é a
 * mesma a cada execução e os screenshots não mudam sozinhos.
 *
 *   npm run seed          # API em :3000, x-api-key: chave-de-teste-local
 * -----------------------------------------------------------------------------
 */
import { createApp } from '../server/main'
import { MemoryOrderStore } from '../store/memoryStore'
import { type CanonicalOrder } from '../core'

const ACCOUNT = 'lojademo'

/**
 * Cada produto tem VARIAÇÕES, e o número delas varia de propósito: é o que faz
 * `/produtos` e `/produtos/skus` mostrarem coisas diferentes. Com um sku por
 * produto (como era antes), as duas telas sairiam idênticas e nenhuma das duas
 * estaria sendo testada de verdade.
 *
 * Produto de variação única (boné, garrafa) existe no meio de propósito: é o
 * caso em que as duas telas DEVEM coincidir.
 */
const PRODUTOS = [
  { productId: 'p1', name: 'Tênis Runner Pro', preco: 49900, variacoes: ['38', '39', '40', '41', '42'] },
  { productId: 'p2', name: 'Camiseta Dry Fit', preco: 8900, variacoes: ['P', 'M', 'G', 'GG'] },
  { productId: 'p3', name: 'Jaqueta Corta-Vento', preco: 32900, variacoes: ['P', 'M', 'G'] },
  { productId: 'p4', name: 'Meia Esportiva (par)', preco: 2900, variacoes: ['35-38', '39-42', '43-46'] },
  { productId: 'p5', name: 'Boné Trail', preco: 7900, variacoes: ['único'] },
  { productId: 'p6', name: 'Mochila 20L', preco: 19900, variacoes: ['Preta', 'Azul'] },
  { productId: 'p7', name: 'Garrafa Térmica 700ml', preco: 12900, variacoes: ['única'] },
  { productId: 'p8', name: 'Short de Corrida', preco: 10900, variacoes: ['P', 'M', 'G'] },
  { productId: 'p9', name: 'Óculos Solar Sport', preco: 25900, variacoes: ['Fumê', 'Espelhado'] },
  { productId: 'p10', name: 'Faixa de Cabeça', preco: 1900, variacoes: ['única'] },
]

const PAGAMENTOS = ['Cartão de crédito', 'Pix', 'Boleto', 'Vale-presente']

/**
 * UFs com PESO, não sorteio uniforme: uma loja brasileira real concentra em
 * SP/RJ/MG, e uma distribuição plana faria o relatório de região parecer
 * quebrado (14 barras idênticas) em vez de mostrar concentração.
 */
const UFS = [
  'SP', 'SP', 'SP', 'SP', 'SP', 'SP',
  'RJ', 'RJ', 'RJ',
  'MG', 'MG',
  'PR', 'RS', 'SC', 'BA', 'PE', 'GO', 'DF',
]

/**
 * Cupom e UTM em MINORIA, que é o caso real: a maior linha dos dois relatórios
 * costuma ser "sem cupom" / "direto". Um seed em que todo pedido tem campanha
 * esconderia justamente o comportamento que a tela precisa acertar.
 */
const CUPONS = ['BEMVINDO10', 'FRETEGRATIS', 'VOLTA15', 'BLACK20']
const ORIGENS = [
  { source: 'google', campaigns: ['search-marca', 'shopping-perf'] },
  { source: 'facebook', campaigns: ['remarketing', 'black-friday'] },
  { source: 'instagram', campaigns: ['influencer-set'] },
  { source: 'email', campaigns: ['newsletter-semanal'] },
]
const SELLERS = ['lojademo', 'Parceiro Norte', 'Parceiro Sul']
const CLIENTES = Array.from({ length: 40 }, (_, i) => `cliente${i + 1}@exemplo.com`)

// Gerador determinístico — mesma "loja" a cada execução.
let seed = 42
function rnd(): number {
  seed = (seed * 1103515245 + 12345) % 2147483648
  return seed / 2147483648
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rnd() * arr.length)]!
}

function gerarPedidos(dias: number): CanonicalOrder[] {
  const orders: CanonicalOrder[] = []
  const hoje = new Date()

  for (let d = dias - 1; d >= 0; d--) {
    const dia = new Date(hoje)
    dia.setDate(dia.getDate() - d)
    // fim de semana vende menos; dá forma à série temporal
    const fds = dia.getDay() === 0 || dia.getDay() === 6
    const qtdPedidos = Math.floor(rnd() * (fds ? 4 : 9)) + (fds ? 1 : 3)

    for (let n = 0; n < qtdPedidos; n++) {
      const createdAt = new Date(dia)
      createdAt.setHours(Math.floor(rnd() * 24), Math.floor(rnd() * 60), 0, 0)

      const nItens = Math.floor(rnd() * 3) + 1
      const items = Array.from({ length: nItens }, () => {
        const p = pick(PRODUTOS)
        const variacao = pick(p.variacoes)
        const quantity = Math.floor(rnd() * 2) + 1
        // ~35% dos itens com desconto
        const temDesconto = rnd() < 0.35
        const unitPaidMinor = temDesconto
          ? Math.round(p.preco * (1 - (0.1 + rnd() * 0.3)))
          : p.preco
        return {
          skuId: `${p.productId}-${variacao}`,
          productId: p.productId,
          // O nome do item na VTEX já descreve a variação, e é dele que a tela
          // de SKUs tira o rótulo — sem isso, cinco tamanhos de tênis viram
          // cinco linhas com o mesmo texto.
          name: p.variacoes.length > 1 ? `${p.name} - ${variacao}` : p.name,
          quantity,
          unitPaidMinor,
          unitListMinor: p.preco,
        }
      })

      const totalMinor = items.reduce(
        (s, i) => s + i.unitPaidMinor * i.quantity,
        0
      )

      const r = rnd()
      const status =
        r < 0.86 ? 'paid' : r < 0.94 ? 'pending' : r < 0.98 ? 'canceled' : 'refunded'

      // O status CRU não é o canônico repetido: é o nome que a VTEX usa, que é
      // o que o relatório de cancelados quebra em linhas. Com `rawStatus` igual
      // ao canônico, a quebra sairia com uma linha só ("canceled") e não
      // exercitaria a distinção entre cancelamento concluído e em curso.
      const RAW: Record<string, string[]> = {
        paid: ['invoiced', 'payment-approved', 'handling', 'ready-for-handling'],
        pending: ['payment-pending', 'window-to-change-payment'],
        canceled: ['canceled', 'cancellation-requested'],
        refunded: ['canceled'],
      }
      const rawStatus = pick(RAW[status]!)

      const pedido: CanonicalOrder = {
        orderId: `${ACCOUNT}-${dia.toISOString().slice(0, 10)}-${n}`,
        createdAt: createdAt.toISOString(),
        status: status as CanonicalOrder['status'],
        rawStatus,
        totalMinor,
        currency: 'BRL',
        paymentMethod: pick(PAGAMENTOS),
        sellerName: pick(SELLERS),
        customerEmail: pick(CLIENTES),
        items,
      }

      // Atribuição: campos OPCIONAIS mesmo no pedido enriquecido, e é isso que
      // as telas precisam saber lidar. ~4% sem UF (digital/retirada), ~22% com
      // cupom, ~35% com UTM — proporções de loja real, em que a maior linha dos
      // dois relatórios é "sem cupom" e "direto".
      if (rnd() > 0.04) pedido.shippingState = pick(UFS)
      if (rnd() < 0.22) pedido.coupon = pick(CUPONS)
      if (rnd() < 0.35) {
        const origem = pick(ORIGENS)
        pedido.utmSource = origem.source
        pedido.utmCampaign = pick(origem.campaigns)
      }

      orders.push(pedido)
    }
  }
  return orders
}

async function main() {
  const store = new MemoryOrderStore()
  const pedidos = gerarPedidos(120)
  await store.upsertOrders(ACCOUNT, pedidos)

  const config = {
    port: Number(process.env.PORT ?? 3000),
    vtex: { account: ACCOUNT, appKey: 'dev', appToken: 'dev' },
    apiKey: process.env.QLAREO_API_KEY ?? 'chave-de-teste-local',
  }

  createApp(config, store).listen(config.port, () => {
    console.log(
      `[seed] ${pedidos.length} pedidos em memória; servidor em :${config.port}`
    )
  })
}

main()
