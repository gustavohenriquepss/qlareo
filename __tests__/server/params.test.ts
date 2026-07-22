import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { parseReportRequest } from '../../server/params'

const q = (s: string) => new URLSearchParams(s)

describe('parseReportRequest', () => {
  test('aceita um relatório válido com defaults (scope=liquido, grain=day)', () => {
    const r = parseReportRequest('sales-by-period', q('from=2026-01-01&to=2026-01-31'))
    assert.ok(r.ok)
    if (r.ok) {
      assert.equal(r.value.report, 'sales-by-period')
      assert.equal(r.value.scope, 'liquido')
      assert.equal(r.value.grain, 'day')
    }
  })

  test('rejeita relatório desconhecido', () => {
    const r = parseReportRequest('faturamento-magico', q('from=2026-01-01&to=2026-01-31'))
    assert.ok(!r.ok)
    if (!r.ok) assert.match(r.error, /desconhecido/)
  })

  test('rejeita from >= to', () => {
    const r = parseReportRequest('sales-by-period', q('from=2026-02-01&to=2026-01-01'))
    assert.ok(!r.ok)
  })

  test('rejeita datas inválidas', () => {
    assert.ok(!parseReportRequest('promotions', q('from=ontem&to=hoje')).ok)
    assert.ok(!parseReportRequest('promotions', q('to=2026-01-31')).ok)
  })

  test('rejeita scope e grain inválidos', () => {
    assert.ok(!parseReportRequest('sales-by-period', q('from=2026-01-01&to=2026-01-31&scope=meio')).ok)
    assert.ok(!parseReportRequest('sales-by-period', q('from=2026-01-01&to=2026-01-31&grain=hora')).ok)
  })

  test('preserva scope e grain válidos', () => {
    const r = parseReportRequest('sales-by-period', q('from=2026-01-01&to=2026-01-31&scope=bruto&grain=month'))
    assert.ok(r.ok)
    if (r.ok) {
      assert.equal(r.value.scope, 'bruto')
      assert.equal(r.value.grain, 'month')
    }
  })
})
