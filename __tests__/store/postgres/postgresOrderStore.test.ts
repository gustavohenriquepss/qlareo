/**
 * Testes de PostgresOrderStore contra um SqlClient FAKE.
 * -----------------------------------------------------------------------------
 * NÃO há Postgres nem o pacote `pg` nesta máquina. A correção do SQL em si
 * (sintaxe, ON CONFLICT, JOIN, CASCADE) exige um Postgres REAL:
 *     docker compose up -d  &&  npm run migrate
 * Estes testes NÃO cobrem isso. Eles cobrem, sem banco, o que mais quebra:
 *   - isolamento de tenant: store_account vai como PARÂMETRO em TODA query;
 *   - parametrização: o valor de store_account nunca é interpolado no texto SQL;
 *   - roteamento de itens: withItems dispara a busca de itens, senão não;
 *   - mapeamento: linha do schema -> CanonicalOrder (BIGINT string->number,
 *     itens agrupados por line_no).
 * Runner nativo do Node. Dados 100% sintéticos.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { PostgresOrderStore } from '../../../store/postgres/postgresOrderStore'
import { type SqlClient, type SqlResult, type SqlRow, type Transactional } from '../../../store/sql'
import { type CanonicalOrder } from '../../../core'

interface Recorded {
  text: string
  params: unknown[]
}

type Responder = (text: string, params: unknown[]) => SqlResult<SqlRow>

/** SqlClient & Transactional falso que registra toda query emitida. */
class FakeSql implements SqlClient, Transactional {
  readonly calls: Recorded[] = []
  private readonly responder: Responder

  constructor(responder?: Responder) {
    this.responder = responder ?? (() => ({ rows: [], rowCount: 0 }))
  }

  async query<T extends SqlRow = SqlRow>(
    text: string,
    params?: ReadonlyArray<unknown>
  ): Promise<SqlResult<T>> {
    const p = params ? [...params] : []
    this.calls.push({ text, params: p })
    return this.responder(text, p) as SqlResult<T>
  }

  async transaction<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T> {
    // Repassa a si mesmo: as queries da transação caem no mesmo log.
    return fn(this)
  }
}

const STORE = 'loja-xyz-123' // valor distintivo, fácil de caçar em texto SQL

function makeOrder(over: Partial<CanonicalOrder> = {}): CanonicalOrder {
  return {
    orderId: 'ORD-1',
    createdAt: '2026-01-10T12:00:00.000Z',
    status: 'paid',
    rawStatus: 'invoiced',
    totalMinor: 14990,
    currency: 'BRL',
    ...over,
  }
}

const RANGE = {
  start: new Date('2026-01-01T00:00:00.000Z'),
  end: new Date('2026-01-31T23:59:59.999Z'),
}

describe('isolamento de tenant — store_account em toda query', () => {
  test('upsertOrders: store_account é parâmetro em cada query emitida', async () => {
    const fake = new FakeSql()
    const store = new PostgresOrderStore(fake)

    await store.upsertOrders(STORE, [
      makeOrder({
        items: [
          { skuId: 'S1', productId: 'P1', name: 'Item A', quantity: 2, unitPaidMinor: 5000 },
        ],
      }),
    ])

    assert.ok(fake.calls.length > 0, 'deveria emitir pelo menos uma query')
    for (const call of fake.calls) {
      assert.ok(
        call.params.includes(STORE),
        `query sem store_account nos params: ${call.text.slice(0, 60)}`
      )
    }
  })

  test('getOrders: store_account é parâmetro em cada query emitida', async () => {
    const fake = new FakeSql()
    const store = new PostgresOrderStore(fake)

    await store.getOrders({ storeAccount: STORE, range: RANGE, withItems: true })

    assert.ok(fake.calls.length > 0)
    for (const call of fake.calls) {
      assert.ok(call.params.includes(STORE), `query sem store_account: ${call.text.slice(0, 60)}`)
    }
  })

  test('getSyncState/setSyncState: store_account é parâmetro', async () => {
    const fake = new FakeSql()
    const store = new PostgresOrderStore(fake)

    await store.getSyncState(STORE)
    await store.setSyncState(STORE, new Date('2026-01-15T00:00:00.000Z'))

    for (const call of fake.calls) {
      assert.ok(call.params.includes(STORE))
    }
  })
})

describe('parametrização — nada de interpolar valor no texto SQL', () => {
  test('o valor de store_account nunca aparece no texto das queries', async () => {
    const fake = new FakeSql()
    const store = new PostgresOrderStore(fake)

    await store.upsertOrders(STORE, [
      makeOrder({ items: [{ skuId: 'S1', productId: 'P1', name: 'A', quantity: 1, unitPaidMinor: 100 }] }),
    ])
    await store.getOrders({ storeAccount: STORE, range: RANGE, withItems: true })
    await store.setSyncState(STORE, new Date())

    for (const call of fake.calls) {
      assert.ok(
        !call.text.includes(STORE),
        `store_account interpolado no texto: ${call.text.slice(0, 80)}`
      )
      // e o texto usa placeholders posicionais
      assert.match(call.text, /\$\d/, 'query sem placeholder posicional ($1, $2, ...)')
    }
  })
})

describe('upsertOrders — detalhe de itens', () => {
  test('com items: apaga (DELETE) e reinsere itens; marca items_synced=TRUE via param', async () => {
    const fake = new FakeSql()
    const store = new PostgresOrderStore(fake)

    await store.upsertOrders(STORE, [
      makeOrder({
        items: [
          { skuId: 'S1', productId: 'P1', name: 'A', quantity: 1, unitPaidMinor: 100 },
          { skuId: 'S2', productId: 'P2', name: 'B', quantity: 3, unitPaidMinor: 200 },
        ],
      }),
    ])

    const texts = fake.calls.map((c) => c.text)
    assert.ok(texts.some((t) => /INSERT INTO orders/i.test(t)), 'faltou UPSERT de orders')
    assert.ok(texts.some((t) => /DELETE FROM order_items/i.test(t)), 'faltou DELETE dos itens')
    const itemInserts = fake.calls.filter((c) => /INSERT INTO order_items/i.test(c.text))
    assert.equal(itemInserts.length, 2, 'deveria inserir 2 itens')

    // line_no sequencial começando em 0 (params: store, order, line_no, ...)
    assert.equal(itemInserts[0].params[2], 0)
    assert.equal(itemInserts[1].params[2], 1)

    // items_synced é o ÚLTIMO param do UPSERT de orders. Referenciado pelo fim,
    // e não por índice fixo: o índice muda toda vez que uma coluna nova entra
    // antes dele, e um teste que quebra por isso não está testando nada útil.
    const orderUpsert = fake.calls.find((c) => /INSERT INTO orders/i.test(c.text))!
    assert.equal(orderUpsert.params.at(-1), true)
  })

  test('sem items: não toca em order_items; items_synced=FALSE no INSERT', async () => {
    const fake = new FakeSql()
    const store = new PostgresOrderStore(fake)

    await store.upsertOrders(STORE, [makeOrder()]) // sem items

    const touchedItems = fake.calls.some((c) => /order_items/i.test(c.text))
    assert.equal(touchedItems, false, 'não deveria mexer em order_items sem items')

    const orderUpsert = fake.calls.find((c) => /INSERT INTO orders/i.test(c.text))!
    assert.equal(orderUpsert.params.at(-1), false)
  })
})

describe('getOrders — roteamento de itens', () => {
  test('withItems=true dispara a busca de itens', async () => {
    const fake = new FakeSql()
    const store = new PostgresOrderStore(fake)

    await store.getOrders({ storeAccount: STORE, range: RANGE, withItems: true })

    assert.ok(fake.calls.some((c) => /FROM order_items/i.test(c.text)), 'faltou SELECT de itens')
  })

  test('withItems ausente/false NÃO busca itens', async () => {
    const fake = new FakeSql()
    const store = new PostgresOrderStore(fake)

    await store.getOrders({ storeAccount: STORE, range: RANGE })

    assert.equal(fake.calls.some((c) => /order_items/i.test(c.text)), false)
  })
})

describe('mapeamento linha->CanonicalOrder', () => {
  // Fake que simula o schema: BIGINT como STRING, created_at como Date.
  function schemaResponder(): Responder {
    const orderRows: SqlRow[] = [
      {
        order_id: 'ORD-1',
        created_at: new Date('2026-01-10T12:00:00.000Z'),
        status: 'paid',
        raw_status: 'invoiced',
        total_minor: '14990', // BIGINT vem como string
        currency: 'BRL',
        payment_method: 'visa',
        seller_name: null,
        customer_email: 'a@b.com',
      },
    ]
    // itens fora de ordem de line_no de propósito: o mapper preserva a ordem
    // do SELECT (que já vem ORDER BY line_no).
    const itemRows: SqlRow[] = [
      {
        order_id: 'ORD-1',
        line_no: '0',
        sku_id: 'S1',
        product_id: 'P1',
        name: 'Item A',
        quantity: '2',
        unit_paid_minor: '5000',
        unit_list_minor: '6000',
      },
      {
        order_id: 'ORD-1',
        line_no: '1',
        sku_id: 'S2',
        product_id: 'P2',
        name: 'Item B',
        quantity: '1',
        unit_paid_minor: '4990',
        unit_list_minor: null, // sem desconto
      },
    ]
    return (text) => {
      if (/FROM order_items/i.test(text)) return { rows: itemRows, rowCount: itemRows.length }
      return { rows: orderRows, rowCount: orderRows.length }
    }
  }

  test('reconstrói o cabeçalho: total_minor string->number, opcionais nulos viram undefined', async () => {
    const store = new PostgresOrderStore(new FakeSql(schemaResponder()))

    const [order] = await store.getOrders({ storeAccount: STORE, range: RANGE })

    assert.equal(order.orderId, 'ORD-1')
    assert.equal(order.createdAt, '2026-01-10T12:00:00.000Z')
    assert.equal(order.status, 'paid')
    assert.equal(order.rawStatus, 'invoiced')
    assert.equal(order.totalMinor, 14990)
    assert.equal(typeof order.totalMinor, 'number')
    assert.equal(order.currency, 'BRL')
    assert.equal(order.paymentMethod, 'visa')
    assert.equal(order.customerEmail, 'a@b.com')
    assert.equal(order.sellerName, undefined) // NULL -> undefined
    assert.equal(order.items, undefined) // sem withItems
  })

  test('withItems: agrupa itens por order_id preservando ordem por line_no', async () => {
    const store = new PostgresOrderStore(new FakeSql(schemaResponder()))

    const [order] = await store.getOrders({ storeAccount: STORE, range: RANGE, withItems: true })

    assert.ok(order.items)
    assert.equal(order.items!.length, 2)
    assert.equal(order.items![0].skuId, 'S1')
    assert.equal(order.items![0].quantity, 2)
    assert.equal(order.items![0].unitPaidMinor, 5000)
    assert.equal(order.items![0].unitListMinor, 6000)
    assert.equal(order.items![1].skuId, 'S2')
    assert.equal(order.items![1].unitListMinor, undefined) // NULL -> undefined
  })
})

// -----------------------------------------------------------------------------
// Declaração de tenant para a RLS (005_rls.sql).
//
// Sem banco não dá para provar que a policy nega — isso está nos testes gated de
// multiTenantSchema.test.ts. Dá para provar o que é responsabilidade DESTE
// arquivo: que a declaração sai, que sai PARAMETRIZADA, e que sai como PRIMEIRA
// instrução dentro da transação. Uma declaração emitida depois da primeira query
// deixaria essa query correndo sem tenant declarado.
// -----------------------------------------------------------------------------

const SET_CONFIG = /set_config\('qlareo\.store_account'/

describe('declaração de tenant para a RLS', () => {
  const casos: [string, (s: PostgresOrderStore) => Promise<unknown>][] = [
    ['getOrders', (s) => s.getOrders({ storeAccount: STORE, range: RANGE })],
    ['getSyncState', (s) => s.getSyncState(STORE)],
    ['setSyncState', (s) => s.setSyncState(STORE, new Date('2026-01-31T00:00:00Z'))],
    ['upsertOrders', (s) => s.upsertOrders(STORE, [makeOrder()])],
  ]

  for (const [nome, executar] of casos) {
    test(`${nome} declara o tenant antes de qualquer outra query`, async () => {
      const sql = new FakeSql()
      await executar(new PostgresOrderStore(sql))

      const primeira = sql.calls[0]
      assert.ok(primeira, `${nome} não emitiu query nenhuma`)
      assert.match(
        primeira!.text,
        SET_CONFIG,
        `${nome}: a primeira instrução da transação tem que ser a declaração ` +
          'do tenant — qualquer query antes dela roda sem tenant declarado'
      )
      assert.deepEqual(
        primeira!.params,
        [STORE],
        'o valor tem que ir em $1; concatenar no texto do SET é injeção'
      )
    })
  }

  test('a declaração é LOCAL — presa à transação, não à conexão', async () => {
    const sql = new FakeSql()
    await new PostgresOrderStore(sql).getSyncState(STORE)

    // Terceiro argumento `true` de set_config = is_local. Sem ele o ajuste fica
    // na CONEXÃO e vaza para a próxima requisição que pegar a mesma do pool:
    // dois lojistas, uma conexão reciclada, e o segundo lê os dados do primeiro.
    assert.match(
      sql.calls[0]!.text.replace(/\s+/g, ' '),
      /set_config\('qlareo\.store_account', \$1, true\)/,
      'set_config sem is_local=true vaza o tenant entre requisições'
    )
  })

  test('nenhuma query escapa da transação', async () => {
    // FakeSql.transaction repassa a si mesmo, então `calls` mistura os dois
    // caminhos. O que dá para afirmar: nada é emitido ANTES da declaração, em
    // nenhum dos métodos — que é o mesmo que dizer que nada roda fora.
    const sql = new FakeSql()
    const store = new PostgresOrderStore(sql)

    await store.getOrders({ storeAccount: STORE, range: RANGE, withItems: true })

    const declaracoes = sql.calls.filter((c) => SET_CONFIG.test(c.text))
    assert.equal(declaracoes.length, 1, 'uma declaração por transação')
    assert.equal(sql.calls.indexOf(declaracoes[0]!), 0)
  })
})
