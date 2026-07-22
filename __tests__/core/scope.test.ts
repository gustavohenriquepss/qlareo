/**
 * Testes de scope.ts — "o que conta como venda".
 * O caso mais importante aqui é o status desconhecido: ele NÃO pode sumir.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { filterByScope } from '../../core/scope'
import { type CanonicalOrder, type CanonicalStatus } from '../../core/types'

function order(orderId: string, status: CanonicalStatus): CanonicalOrder {
  return {
    orderId,
    createdAt: '2026-01-15T12:00:00.000Z',
    status,
    rawStatus: `raw-${status}`,
    totalMinor: 10000,
    currency: 'BRL',
  }
}

const mix: CanonicalOrder[] = [
  order('pago', 'paid'),
  order('cancelado', 'canceled'),
  order('pendente', 'pending'),
  order('estornado', 'refunded'),
]

const ids = (orders: CanonicalOrder[]) => orders.map((o) => o.orderId).sort()

describe('filterByScope', () => {
  test('liquido remove pendente, cancelado e estornado', () => {
    assert.deepEqual(ids(filterByScope(mix, 'liquido')), ['pago'])
  })

  test('liquido é o default', () => {
    assert.deepEqual(ids(filterByScope(mix)), ['pago'])
  })

  test('bruto remove só o que nunca pagou (mantém cancelado e estornado)', () => {
    assert.deepEqual(ids(filterByScope(mix, 'bruto')), [
      'cancelado',
      'estornado',
      'pago',
    ])
  })

  test('todos mantém tudo', () => {
    assert.deepEqual(ids(filterByScope(mix, 'todos')), [
      'cancelado',
      'estornado',
      'pago',
      'pendente',
    ])
  })

  test('conjunto vazio não quebra', () => {
    assert.deepEqual(filterByScope([], 'liquido'), [])
  })

  test('não muta a lista de entrada', () => {
    const antes = mix.length
    filterByScope(mix, 'liquido')
    assert.equal(mix.length, antes)
  })

  /**
   * Contrato com os adapters: status desconhecido é mapeado para `paid`, então
   * um workflow customizado da loja sobrevive a qualquer recorte. Se este teste
   * quebrar, algum adapter passou a classificar desconhecido como pending e
   * pedidos vão sumir silenciosamente do relatório.
   */
  test('pedido vindo de status customizado (mapeado como paid) sobrevive ao recorte líquido', () => {
    const custom: CanonicalOrder = {
      ...order('custom', 'paid'),
      rawStatus: 'aguardando-conferencia-fiscal',
    }
    const out = filterByScope([...mix, custom], 'liquido')
    assert.deepEqual(ids(out), ['custom', 'pago'])
  })
})
