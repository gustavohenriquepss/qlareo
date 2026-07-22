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

const PRODUTOS = [
  { productId: 'p1', name: 'Tênis Runner Pro', preco: 49900 },
  { productId: 'p2', name: 'Camiseta Dry Fit', preco: 8900 },
  { productId: 'p3', name: 'Jaqueta Corta-Vento', preco: 32900 },
  { productId: 'p4', name: 'Meia Esportiva (par)', preco: 2900 },
  { productId: 'p5', name: 'Boné Trail', preco: 7900 },
  { productId: 'p6', name: 'Mochila 20L', preco: 19900 },
  { productId: 'p7', name: 'Garrafa Térmica 700ml', preco: 12900 },
  { productId: 'p8', name: 'Short de Corrida', preco: 10900 },
  { productId: 'p9', name: 'Óculos Solar Sport', preco: 25900 },
  { productId: 'p10', name: 'Faixa de Cabeça', preco: 1900 },
]

const PAGAMENTOS = ['Cartão de crédito', 'Pix', 'Boleto', 'Vale-presente']
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
        const quantity = Math.floor(rnd() * 2) + 1
        // ~35% dos itens com desconto
        const temDesconto = rnd() < 0.35
        const unitPaidMinor = temDesconto
          ? Math.round(p.preco * (1 - (0.1 + rnd() * 0.3)))
          : p.preco
        return {
          skuId: `${p.productId}-u`,
          productId: p.productId,
          name: p.name,
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

      orders.push({
        orderId: `${ACCOUNT}-${dia.toISOString().slice(0, 10)}-${n}`,
        createdAt: createdAt.toISOString(),
        status: status as CanonicalOrder['status'],
        rawStatus: status,
        totalMinor,
        currency: 'BRL',
        paymentMethod: pick(PAGAMENTOS),
        sellerName: pick(SELLERS),
        customerEmail: pick(CLIENTES),
        items,
      })
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
