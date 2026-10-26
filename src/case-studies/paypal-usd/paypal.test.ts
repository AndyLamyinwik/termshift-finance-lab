import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { compareContracts } from '../../engine'
import type { Comparison, EngineResult } from '../../engine'
import { parseAndVerifyProofBytes } from '../../features/portable-evidence/portable'
import { ContractSchema, ScenarioSchema } from '../../models'
import type { Scenario } from '../../models'
import { ImpactProofSchema, verifyImpactProof } from '../../proof'
import { experiments } from '../../scenarios'
import {
  buildPayPalCaseStudy, createPayPalEvidence, paypalScenarios, paypalSource,
  planA, planB, renderPayPalFeeCurve,
} from './index'
import { referenceTotal, referenceTransactionFee } from './reference'

const artifactRoot = new URL('../../../public/case-studies/paypal-usd/', import.meta.url)
const manualCases = [
  { amounts: [100], a: 52, b: 14 },
  { amounts: [500], a: 66, b: 34 },
  { amounts: [1000], a: 84, b: 59 },
  { amounts: [2000], a: 119, b: 109 },
  { amounts: [2666], a: 142, b: 142 },
  { amounts: [2667], a: 142, b: 142 },
  { amounts: [3000], a: 154, b: 159 },
  { amounts: [10000], a: 398, b: 508 },
  { amounts: Array<number>(10).fill(100), a: 520, b: 140 },
  { amounts: [100, 1000, 3000, 10000], a: 688, b: 740 },
]

function comparison(result: EngineResult<Comparison>): Comparison {
  if (!result.success) throw new Error(JSON.stringify(result.issues))
  return result.data
}

function oneReceipt(amountCents: number): Scenario {
  return {
    schemaVersion: 1, id: 'reference-receipt', billingMonth: '2026-10',
    transactions: [{ id: 'reference-payment', occurredOn: '2026-10-15', amountCents, kind: 'purchase' }],
    paymentEvents: [],
  }
}

function artifact(name: string): string {
  return readFileSync(new URL(name, artifactRoot), 'utf8')
}

const nonzeroCases = paypalScenarios.filter(entry => entry.expected.planACents !== entry.expected.planBCents)
const equalCases = paypalScenarios.filter(entry => entry.expected.planACents === entry.expected.planBCents)

describe('independent decimal-rational reference calculator', () => {
  it.each(manualCases)('independently reproduces manually tabulated $amounts cents', ({ amounts, a, b }) => {
    expect(referenceTotal(amounts, '3.49', '0.49')).toBe(a)
    expect(referenceTotal(amounts, '4.99', '0.09')).toBe(b)
  })

  it('rounds exact half cents up and sums each receipt independently', () => {
    expect(referenceTransactionFee(5000, '0.01', '0.00')).toBe(1)
    expect(referenceTransactionFee(4999, '0.01', '0.00')).toBe(0)
    expect(referenceTransactionFee(5001, '0.01', '0.00')).toBe(1)
    expect(referenceTotal([1000], '3.49', '0.49')).toBe(84)
    expect(referenceTotal(Array<number>(10).fill(100), '3.49', '0.49')).toBe(520)
    expect(referenceTotal([1000], '4.99', '0.09')).toBe(59)
    expect(referenceTotal(Array<number>(10).fill(100), '4.99', '0.09')).toBe(140)
  })

  it('does not silently accept imprecise monetary or percentage inputs', () => {
    for (const invalid of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => referenceTransactionFee(invalid, '3.49', '0.49')).toThrow()
    }
    expect(() => referenceTransactionFee(100, '3.49%', '0.49')).toThrow()
    expect(() => referenceTransactionFee(100, '3.49', '0.001')).toThrow()
    expect(() => referenceTransactionFee(Number.MAX_SAFE_INTEGER, '100', '1.00')).toThrow(/safe integer/)
  })
})

describe('PayPal published-rate fixture boundaries and provenance', () => {
  it('maps the captured public rate fields to USD-only transaction rules', () => {
    expect(ContractSchema.safeParse(planA).success).toBe(true)
    expect(ContractSchema.safeParse(planB).success).toBe(true)
    expect(planA.rules).toEqual({ transactionFee: { rateBps: 349, fixedCents: 49 } })
    expect(planB.rules).toEqual({ transactionFee: { rateBps: 499, fixedCents: 9 } })
    expect(planA.rules.transactionFee).toEqual({
      rateBps: paypalSource.plans.A.rateBps, fixedCents: paypalSource.plans.A.fixedCents,
    })
    expect(planB.rules.transactionFee).toEqual({
      rateBps: paypalSource.plans.B.rateBps, fixedCents: paypalSource.plans.B.fixedCents,
    })
    expect(planA.currency).toBe('USD')
    expect(planB.currency).toBe('USD')
    expect(planA.effectiveDate).toBe(paypalSource.capturedOn)
    expect(planB.effectiveDate).toBe(paypalSource.capturedOn)
    expect(JSON.parse(artifact('source-capture.json'))).toEqual(paypalSource)
  })

  it('records domestic scope, eligibility, Static/Dynamic distinction and model assumptions', () => {
    expect(paypalSource.url).toBe('https://www.paypal.com/us/business/paypal-business-fees')
    expect(paypalSource.termsUrl).toBe('https://www.paypal.com/us/legalhub/paypal/useragreement-full')
    expect(paypalSource.capturedOn).toBe('2026-10-27')
    expect(paypalSource.feePageUpdatedOn).toBe('2026-10-01')
    expect(paypalSource.market).toBe('United States (US)')
    expect(paypalSource.currency).toBe('USD')
    const conditions = paypalSource.applicability.join(' ')
    expect(conditions).toMatch(/eligible domestic/)
    expect(conditions).toMatch(/application and approval/)
    expect(conditions).toMatch(/previously approved Static/)
    expect(conditions).toMatch(/Dynamic.*lower applicable tariff/)
    expect(conditions).toMatch(/not obliged to offer Static/)
    expect(paypalSource.modelAssumptions.join(' ')).toMatch(/do not establish.*same rounding policy/)
    expect(paypalSource.modelAssumptions.join(' ')).toMatch(/not old and new versions/)
    expect(paypalSource.exclusions.join(' ')).toMatch(/cross-border/)
    expect(paypalSource.exclusions.join(' ')).toMatch(/Refunds/)
    expect(paypalSource.exclusions.join(' ')).toMatch(/Currency conversion/)
  })

  it('adds separate case inputs while preserving the three formal synthetic experiments', () => {
    expect(experiments.map(entry => entry.id)).toEqual(['waiver-trap', 'microtransaction-penalty', 'grace-period-shift'])
    expect(paypalScenarios).toHaveLength(manualCases.length)
    expect(nonzeroCases).toHaveLength(8)
    expect(equalCases).toHaveLength(2)
    expect(new Set(paypalScenarios.map(entry => entry.id)).size).toBe(paypalScenarios.length)
  })

  it.each(paypalScenarios)('validates and independently recalculates $id after JSON round trip', entry => {
    const restored: unknown = JSON.parse(JSON.stringify(entry.scenario))
    const parsed = ScenarioSchema.parse(restored)
    expect(parsed).toEqual(entry.scenario)
    const amounts = parsed.transactions.map(item => item.amountCents)
    const manual = manualCases.find(item => JSON.stringify(item.amounts) === JSON.stringify(amounts))
    expect(manual).toBeDefined()
    if (!manual) throw new Error('Every shipped scenario must have a separate manually tabulated expectation.')
    expect(entry.expected).toEqual({ planACents: manual.a, planBCents: manual.b })
    const expectedA = referenceTotal(amounts, '3.49', '0.49')
    const expectedB = referenceTotal(amounts, '4.99', '0.09')
    const result = comparison(compareContracts(planA, planB, parsed))
    expect([result.oldEvaluation.totalCents, result.newEvaluation.totalCents, result.deltaCents])
      .toEqual([expectedA, expectedB, expectedB - expectedA])
  })
})

describe('cent-by-cent engine versus independent reference', () => {
  it.each(Array.from({ length: 10 }, (_, index) => index * 1000 + 1))(
    'matches both plans for 1,000 consecutive amounts starting at %i cents', start => {
      for (let cents = start; cents < start + 1000; cents += 1) {
        const result = comparison(compareContracts(planA, planB, oneReceipt(cents)))
        const a = referenceTransactionFee(cents, '3.49', '0.49')
        const b = referenceTransactionFee(cents, '4.99', '0.09')
        expect([result.oldEvaluation.totalCents, result.newEvaluation.totalCents, result.deltaCents], `USD cents ${cents}`)
          .toEqual([a, b, b - a])
      }
    },
  )

  it('preserves the non-contiguous rounded equality region instead of inventing a $26.67 switch', () => {
    const values = Array.from({ length: 10000 }, (_, index) => index + 1)
    const delta = (cents: number) => referenceTransactionFee(cents, '4.99', '0.09') - referenceTransactionFee(cents, '3.49', '0.49')
    const ties = values.filter(cents => delta(cents) === 0)
    expect(values.find(cents => delta(cents) > 0)).toBe(2676)
    expect(values.filter(cents => delta(cents) < 0).at(-1)).toBe(2655)
    expect([ties[0], ties.at(-1), ties.length]).toEqual([2616, 2715, 65])
    expect(delta(2666)).toBe(0)
    expect(delta(2667)).toBe(0)
    expect(ties.some((cents, index) => index > 0 && cents !== (ties[index - 1] ?? 0) + 1)).toBe(true)
  })
})

describe('published case results and portable evidence artifacts', () => {
  it('keeps build results deterministic and detached from the original scenario fixtures', () => {
    const before = JSON.stringify({ planA, planB, paypalScenarios })
    const first = buildPayPalCaseStudy()
    expect(buildPayPalCaseStudy()).toEqual(first)
    const row = first.rows[0]
    if (!row) throw new Error('Missing case row.')
    row.scenario.transactions.splice(0)
    row.expected.planACents = 0
    expect(JSON.stringify({ planA, planB, paypalScenarios })).toBe(before)
    expect(buildPayPalCaseStudy().rows[0]?.scenario.transactions).toHaveLength(1)
    expect(buildPayPalCaseStudy().rows[0]?.expected.planACents).toBe(52)
  })

  it('ships current source, contract, scenario and chart results rather than stale generated data', () => {
    const study = buildPayPalCaseStudy()
    expect(JSON.parse(artifact('results.json'))).toMatchObject({
      caseStudyVersion: 1, source: paypalSource, contracts: { planA, planB },
      schemaMapping: { oldContract: 'planA', newContract: 'planB' },
      rows: study.rows, chartPoints: study.chartPoints,
    })
    const svg = artifact('fee-curve.svg')
    expect(svg).toBe(renderPayPalFeeCurve(study.chartPoints))
    expect(svg).toContain('Plan A and Plan B modeled fees')
    expect(svg).toContain('Lines connect samples')
    expect(svg).not.toMatch(/<script|<foreignObject|(?:href|src)=["']https?:/i)
    for (const point of study.chartPoints) {
      expect([point.planACents, point.planBCents]).toEqual([
        referenceTransactionFee(point.amountCents, '3.49', '0.49'),
        referenceTransactionFee(point.amountCents, '4.99', '0.09'),
      ])
    }
  })

  it.each(nonzeroCases)('ships independently verifiable, reimportable and deterministic evidence for $id', entry => {
    const evidence = createPayPalEvidence(entry.id)
    expect(createPayPalEvidence(entry.id)).toEqual(evidence)
    const shipped: unknown = JSON.parse(artifact(`${entry.id}-proof.json`))
    expect(shipped).toEqual(evidence.proof)
    expect(ImpactProofSchema.safeParse(shipped).success).toBe(true)
    const verification = verifyImpactProof(shipped)
    expect(verification.success).toBe(true)
    if (!verification.success) throw new Error(JSON.stringify(verification.issues))
    const proof = verification.data.proof
    expect(proof.oldContract).toEqual(planA)
    expect(proof.newContract).toEqual(planB)
    expect(proof.originalScenario).toEqual(entry.scenario)
    expect(proof.witnessSource.source).toBe('base')
    expect(proof.searchOptions.maxEvaluations).toBe(1)
    expect(proof.originalComparison.deltaCents).toBe(entry.expected.planBCents - entry.expected.planACents)
    expect(proof.minimizedComparison.deltaCents).not.toBe(0)
    expect(Math.sign(proof.minimizedComparison.deltaCents)).toBe(Math.sign(proof.originalComparison.deltaCents))
    const amounts = proof.minimizedScenario.transactions.map(item => item.amountCents)
    expect(proof.minimizedComparison.oldEvaluation.totalCents).toBe(referenceTotal(amounts, '3.49', '0.49'))
    expect(proof.minimizedComparison.newEvaluation.totalCents).toBe(referenceTotal(amounts, '4.99', '0.09'))
    const imported = parseAndVerifyProofBytes(new TextEncoder().encode(artifact(`${entry.id}-proof.json`)))
    expect(imported.success).toBe(true)
    expect(artifact(`${entry.id}-report.md`)).toBe(evidence.markdown)
    expect(evidence.markdown).toContain('Plan A: PayPal Checkout')
    expect(evidence.markdown).toContain('Plan B: Static Micropayments')
    expect(evidence.markdown).toMatch(/not a historical price change/)
    expect(evidence.markdown).toMatch(/not.*verified PayPal rounding|does not establish PayPal uses the same rounding/)
    expect(evidence.markdown).toContain('oldContract = Plan A; newContract = Plan B')
  })

  it.each(nonzeroCases)('rejects a one-cent altered recorded financial result for $id', entry => {
    const proof = structuredClone(createPayPalEvidence(entry.id).proof)
    proof.minimizedComparison.deltaCents += 1
    const result = parseAndVerifyProofBytes(new TextEncoder().encode(JSON.stringify(proof)))
    expect(result.success).toBe(false)
    if (result.success) throw new Error('A modified calculation must not verify.')
    expect(result.phase).toBe('verification')
    expect(result.issues.some(issue => issue.code === 'proof_mismatch')).toBe(true)
  })

  it.each(equalCases)('reports $id as equal fees without fabricating a nonzero proof', entry => {
    expect(comparison(compareContracts(planA, planB, entry.scenario)).deltaCents).toBe(0)
    expect(() => createPayPalEvidence(entry.id)).toThrow(/equal fees.*nonzero counterexample/)
    expect(existsSync(new URL(`${entry.id}-proof.json`, artifactRoot))).toBe(false)
    expect(existsSync(new URL(`${entry.id}-report.md`, artifactRoot))).toBe(false)
  })

  it('rejects an unknown evidence case rather than generating unrelated evidence', () => {
    expect(() => createPayPalEvidence('unknown-case')).toThrow(/Unknown PayPal case/)
  })
})
