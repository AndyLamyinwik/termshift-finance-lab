import { compareContracts } from '../../engine'
import type { Comparison } from '../../engine'
import type { Scenario } from '../../models'
import { paypalScenarios, planA, planB } from './fixtures'

export interface PayPalResultRow {
  id: string
  label: string
  scenario: Scenario
  comparison: Comparison
  expected: { planACents: number; planBCents: number }
}

export interface PayPalChartPoint {
  amountCents: number
  planACents: number
  planBCents: number
}

export interface PayPalCaseStudy {
  rows: PayPalResultRow[]
  chartPoints: PayPalChartPoint[]
}

/** Presentation formatting only; monetary results remain integer cents. */
export function paypalUsd(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new Error('USD formatting requires safe integer cents.')
  const value = BigInt(cents)
  const absolute = value < 0n ? -value : value
  return `${value < 0n ? '-' : ''}$${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`
}

export function paypalDelta(cents: number): string {
  return `${cents > 0 ? '+' : ''}${paypalUsd(cents)}`
}

function checkedComparison(scenario: Scenario): Comparison {
  const result = compareContracts(planA, planB, scenario)
  if (!result.success) {
    throw new Error(`PayPal case calculation failed: ${result.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`)
  }
  return result.data
}

/** Fixed, offline case inputs. No expected value is used as an engine result. */
export function buildPayPalCaseStudy(): PayPalCaseStudy {
  const rows = paypalScenarios.map((entry): PayPalResultRow => {
    const scenario = structuredClone(entry.scenario)
    const comparison = checkedComparison(scenario)
    if (comparison.oldEvaluation.totalCents !== entry.expected.planACents
      || comparison.newEvaluation.totalCents !== entry.expected.planBCents) {
      throw new Error(`Independent expectation mismatch for PayPal scenario ${entry.id}.`)
    }
    return { id: entry.id, label: entry.label, scenario, comparison, expected: { ...entry.expected } }
  })

  // Whole-dollar samples plus cent-by-cent detail around the theoretical crossing.
  // Connecting chart samples is visual interpolation; the table holds exact fees.
  const amounts = new Set([1, ...Array.from({ length: 100 }, (_, index) => (index + 1) * 100)])
  for (let amount = 2600; amount <= 2730; amount += 1) amounts.add(amount)
  const chartPoints = [...amounts].sort((a, b) => a - b).map((amountCents): PayPalChartPoint => {
    const comparison = checkedComparison({
      schemaVersion: 1,
      id: `paypal-chart-${amountCents}`,
      billingMonth: '2026-10',
      transactions: [{ id: 'chart-payment', occurredOn: '2026-10-01', amountCents, kind: 'purchase' }],
      paymentEvents: [],
    })
    return {
      amountCents,
      planACents: comparison.oldEvaluation.totalCents,
      planBCents: comparison.newEvaluation.totalCents,
    }
  })
  return { rows, chartPoints }
}
