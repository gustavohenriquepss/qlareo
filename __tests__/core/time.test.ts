/**
 * Testes de time.ts — a virada de dia no fuso da loja.
 * Sem isso, a venda das 22h vira "venda de amanhã" e a série diária mente.
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { bucketKey, dayKeyInTz, isoWeek } from '../../core/time'

describe('dayKeyInTz', () => {
  test('23h30 UTC do dia 15 ainda é dia 15 em São Paulo (20h30 local)', () => {
    assert.equal(dayKeyInTz('2026-01-15T23:30:00Z'), '2026-01-15')
  })

  test('01h UTC do dia 16 é dia 15 em São Paulo (22h local) — o caso clássico', () => {
    assert.equal(dayKeyInTz('2026-01-16T01:00:00Z'), '2026-01-15')
  })

  test('03h UTC do dia 16 já virou o dia 16 local (00h)', () => {
    assert.equal(dayKeyInTz('2026-01-16T03:00:00Z'), '2026-01-16')
  })

  test('respeita fuso passado explicitamente', () => {
    assert.equal(dayKeyInTz('2026-01-16T01:00:00Z', 'UTC'), '2026-01-16')
  })
})

describe('bucketKey', () => {
  test('grão dia devolve a data completa', () => {
    assert.equal(bucketKey('2026-01-15T12:00:00Z', 'day'), '2026-01-15')
  })

  test('grão mês corta em YYYY-MM', () => {
    assert.equal(bucketKey('2026-01-15T12:00:00Z', 'month'), '2026-01')
  })

  test('grão semana usa numeração ISO', () => {
    // 2026-01-15 é uma quinta-feira -> semana ISO 03
    assert.equal(bucketKey('2026-01-15T12:00:00Z', 'week'), '2026-W03')
  })

  test('o fuso é aplicado ANTES de escolher o bucket', () => {
    // 01h UTC do dia 16 é 22h do dia 15 em SP -> cai no bucket do dia 15
    assert.equal(bucketKey('2026-01-16T01:00:00Z', 'day'), '2026-01-15')
    assert.equal(bucketKey('2026-02-01T01:00:00Z', 'month'), '2026-01')
  })
})

describe('isoWeek', () => {
  test('4 de janeiro sempre cai na semana 1', () => {
    assert.equal(isoWeek(new Date(Date.UTC(2026, 0, 4))), 1)
  })

  test('primeira quinta define a semana 1', () => {
    assert.equal(isoWeek(new Date(Date.UTC(2026, 0, 15))), 3)
  })

  test('fim de ano pode pertencer à semana 1 do ano seguinte', () => {
    // 2025-12-29 é segunda-feira da semana que contém 2026-01-01 (quinta)
    assert.equal(isoWeek(new Date(Date.UTC(2025, 11, 29))), 1)
  })
})
