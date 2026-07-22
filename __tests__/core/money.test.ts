/**
 * Testes de money.ts — a fronteira onde os bugs de dinheiro nascem.
 * Runner nativo do Node. Dados 100% sintéticos.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { decimalsFor, parseDecimalToMinor, round, toMajor } from '../../core/money'

describe('decimalsFor', () => {
  test('moedas de 2 casas', () => {
    assert.equal(decimalsFor('BRL'), 2)
    assert.equal(decimalsFor('USD'), 2)
  })

  test('moedas sem subunidade', () => {
    assert.equal(decimalsFor('JPY'), 0)
    assert.equal(decimalsFor('CLP'), 0)
  })

  test('é indiferente a caixa', () => {
    assert.equal(decimalsFor('brl'), 2)
  })

  test('moeda desconhecida cai no default de 2 casas', () => {
    assert.equal(decimalsFor('XYZ'), 2)
  })
})

describe('toMajor', () => {
  test('centavos -> reais: 14990 vira 149.9 (bug nº 1 do domínio)', () => {
    assert.equal(toMajor(14990), 149.9)
  })

  test('bordas: zero, um centavo, valor redondo', () => {
    assert.equal(toMajor(0), 0)
    assert.equal(toMajor(1), 0.01)
    assert.equal(toMajor(10000), 100)
  })

  test('moeda sem subunidade não divide', () => {
    assert.equal(toMajor(1500, 'JPY'), 1500)
  })

  test('valor negativo (estorno) preserva o sinal', () => {
    assert.equal(toMajor(-14990), -149.9)
  })
})

describe('parseDecimalToMinor', () => {
  test('string decimal com ponto (formato Shopify/Woo)', () => {
    assert.equal(parseDecimalToMinor('149.90'), 14990)
  })

  test('string decimal com vírgula', () => {
    assert.equal(parseDecimalToMinor('149,90'), 14990)
  })

  test('completa casas faltantes: "149.9" -> 14990', () => {
    assert.equal(parseDecimalToMinor('149.9'), 14990)
  })

  test('inteiro sem parte decimal', () => {
    assert.equal(parseDecimalToMinor('149'), 14900)
  })

  test('um centavo e zero', () => {
    assert.equal(parseDecimalToMinor('0.01'), 1)
    assert.equal(parseDecimalToMinor('0'), 0)
  })

  test('negativo (estorno)', () => {
    assert.equal(parseDecimalToMinor('-10.50'), -1050)
  })

  test('aceita number e não perde precisão no caminho', () => {
    assert.equal(parseDecimalToMinor(149.9), 14990)
    assert.equal(parseDecimalToMinor(0.1), 10)
    // o clássico: 0.1 + 0.2 em float
    assert.equal(parseDecimalToMinor(0.1 + 0.2), 30)
  })

  test('moeda sem subunidade não multiplica', () => {
    assert.equal(parseDecimalToMinor('1500', 'JPY'), 1500)
  })

  test('casas extras são TRUNCADAS, não arredondadas (comportamento documentado)', () => {
    assert.equal(parseDecimalToMinor('149.999'), 14999)
  })

  test('valor inválido falha alto, em vez de virar NaN silencioso', () => {
    assert.throws(() => parseDecimalToMinor('abc'), /Valor monetário inválido/)
    assert.throws(() => parseDecimalToMinor('R$ 149,90'), /Valor monetário inválido/)
    assert.throws(() => parseDecimalToMinor(''), /Valor monetário inválido/)
  })
})

describe('round', () => {
  test('mata o artefato clássico de float', () => {
    assert.equal(round(0.1 + 0.2), 0.3)
    assert.equal(round(1.005, 2), 1.01)
  })

  test('respeita o número de casas', () => {
    assert.equal(round(149.9567, 2), 149.96)
    assert.equal(round(149.9567, 0), 150)
  })
})
