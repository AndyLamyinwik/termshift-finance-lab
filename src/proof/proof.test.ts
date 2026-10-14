import { describe, expect, it } from 'vitest'
import { compareContracts, type Comparison } from '../engine'
import type { EvidenceResult } from '../minimizer/types'
import type { Contract, Scenario } from '../models'
import { experiments, type ExperimentFixture } from '../scenarios'
import { searchCounterexamples, type SearchOptions, type Witness } from '../search'
import { createImpactProof, formatImpactReport, verifyImpactProof, type ImpactProof } from './index'

const searchOptions: SearchOptions = {
  seed: 20260401, maxEvaluations: 120, maxResults: 5,
  purchaseCountMin: 0, purchaseCountMax: 10,
  purchaseAmountCentsMin: 100, purchaseAmountCentsMax: 1000,
  lateDaysMin: 0, lateDaysMax: 5,
}

function success<T>(result: EvidenceResult<T>): T {
  expect(result.success).toBe(true)
  if (!result.success) throw new Error(JSON.stringify(result.issues))
  return result.data
}

function failure<T>(result: EvidenceResult<T>, code?: string) {
  expect(result.success).toBe(false)
  expect(result).not.toHaveProperty('data')
  if (result.success) throw new Error('Expected structured evidence failure.')
  expect(result.issues.length).toBeGreaterThan(0)
  if (code) expect(result.issues.some((issue) => issue.code === code)).toBe(true)
  result.issues.forEach((issue) => {
    expect(Array.isArray(issue.path)).toBe(true)
    expect(issue.message.length).toBeGreaterThan(0)
  })
}

function searchedWitness(experiment: ExperimentFixture, minimumCount: number): Witness {
  const base = structuredClone(experiment.scenario)
  base.transactions = []
  base.paymentEvents = base.paymentEvents.map((payment) => ({ ...payment, paidOn: payment.dueOn }))
  const searched = searchCounterexamples(experiment.oldContract, experiment.newContract, base, searchOptions)
  if (!searched.success) throw new Error(JSON.stringify(searched.issues))
  const witness = searched.data.witnesses.find((item) => item.scenario.transactions.length >= minimumCount)
  if (!witness) throw new Error(`No retained actual search witness for ${experiment.name}.`)
  return witness
}

const formalCases = experiments.map((experiment, index) => {
  const witness = searchedWitness(experiment, index === 0 ? 6 : 2)
  const proof = success(createImpactProof(experiment.oldContract, experiment.newContract, witness, searchOptions))
  return { experiment, witness, proof }
})

function frozen<T>(input: T): T {
  if (input !== null && typeof input === 'object') {
    Object.values(input).forEach((child: unknown) => frozen(child))
    Object.freeze(input)
  }
  return input
}

function reorder(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(reorder)
  if (input !== null && typeof input === 'object') {
    return Object.fromEntries(Object.entries(input).reverse().map(([key, value]) => [key, reorder(value)]))
  }
  return input
}

function recalculated(proof: ImpactProof, scenario: Scenario): Comparison {
  const result = compareContracts(proof.oldContract, proof.newContract, scenario)
  if (!result.success) throw new Error(JSON.stringify(result.issues))
  return result.data
}

describe('portable Proof of Impact', () => {
  it.each(formalCases)('verifies full real-search evidence for $experiment.name', ({ experiment, witness, proof }) => {
    const verified = success(verifyImpactProof(proof))
    expect(verified.proof).toEqual(proof)
    expect(verified.verifiedComparisons).toBe(2 + proof.reductionSteps.length)
    expect(proof.proofSchemaVersion).toBe(1)
    expect(proof.engineVersion).toBe('stage3-v1')
    expect(proof.minimizerVersion).toBe('stage4b-v1')
    expect(proof.oldContract).toEqual(experiment.oldContract)
    expect(proof.newContract).toEqual(experiment.newContract)
    expect(proof.witnessSource).toEqual({ candidateId: witness.candidateId, sequence: witness.sequence,
      source: witness.source, parameters: witness.parameters })
    expect(proof.searchOptions).toEqual(searchOptions)
    expect(proof.originalScenario).toEqual(witness.scenario)
    expect(proof.originalComparison).toEqual(witness.comparison)
    expect(proof.minimizedComparison).toEqual(recalculated(proof, proof.minimizedScenario))
    expect(proof.originalComparison.deltaCents).not.toBe(0)
    expect(Math.sign(proof.minimizedComparison.deltaCents)).toBe(Math.sign(proof.originalComparison.deltaCents))
    expect(proof.minimizationBudget.checksPerformed).toBeLessThanOrEqual(200)
    expect(proof.calculationPolicy.moneyUnit).toContain('USD cents')
    expect(proof.calculationPolicy.rounding).toContain('each transaction')
    expect(proof.limitations.join(' ')).toContain('globally minimal')
    expect(proof.limitations.join(' ')).toContain('no digital signature')
    expect(proof.limitations.join(' ')).toContain('not successful financial evaluation')
  })

  it.each(formalCases)('preserves $experiment.name evidence in a JSON round-trip', ({ proof }) => {
    const decoded: unknown = JSON.parse(JSON.stringify(proof))
    const verified = success(verifyImpactProof(decoded))
    expect(verified.proof).toEqual(proof)
    expect(success(formatImpactReport(decoded))).toBe(success(formatImpactReport(proof)))
  })

  it('compares JSON data independently of object key insertion order', () => {
    const { proof } = formalCases[1]!
    expect(success(verifyImpactProof(reorder(proof))).proof).toEqual(proof)
  })

  it('creates and verifies deterministic evidence without mutating frozen input or the proof', () => {
    const { experiment, witness, proof } = formalCases[2]!
    const input = frozen(structuredClone({ old: experiment.oldContract, new: experiment.newContract,
      witness, searchOptions, options: { maxChecks: 200 } }))
    const before = JSON.stringify(input)
    expect(createImpactProof(input.old, input.new, input.witness, input.searchOptions, input.options))
      .toEqual(createImpactProof(input.old, input.new, input.witness, input.searchOptions, input.options))
    expect(JSON.stringify(input)).toBe(before)
    const lockedProof = frozen(structuredClone(proof))
    const proofBefore = JSON.stringify(lockedProof)
    expect(verifyImpactProof(lockedProof)).toEqual(verifyImpactProof(lockedProof))
    expect(formatImpactReport(lockedProof)).toEqual(formatImpactReport(lockedProof))
    expect(JSON.stringify(lockedProof)).toBe(proofBefore)
  })

  it('verifies a budget-exhausted unreduced proof', () => {
    const { experiment, witness } = formalCases[1]!
    const proof = success(createImpactProof(experiment.oldContract, experiment.newContract, witness, searchOptions, { maxChecks: 1 }))
    expect(proof.minimizationBudget).toEqual({ maxChecks: 1, checksPerformed: 1,
      budgetExhausted: true, terminationReason: 'budget-exhausted' })
    expect(proof.minimizedScenario).toEqual(proof.originalScenario)
    expect(proof.reductionSteps).toEqual([])
    expect(success(verifyImpactProof(proof)).verifiedComparisons).toBe(2)
  })

  it('verifies negative impact as well as positive impact', () => {
    const { experiment, witness } = formalCases[1]!
    const comparison = compareContracts(experiment.newContract, experiment.oldContract, witness.scenario)
    if (!comparison.success) throw new Error(JSON.stringify(comparison.issues))
    const reversed = { ...witness, comparison: comparison.data, deltaCents: comparison.data.deltaCents }
    const proof = success(createImpactProof(experiment.newContract, experiment.oldContract, reversed, searchOptions))
    expect(proof.originalComparison.deltaCents).toBeLessThan(0)
    expect(proof.minimizedComparison.deltaCents).toBe(-20)
    expect(verifyImpactProof(proof).success).toBe(true)
    expect(success(formatImpactReport(proof))).toContain('-$0.20')
  })

  it('rejects a fabricated witness rather than packaging its pre-recorded financial values', () => {
    const { experiment, witness } = formalCases[1]!
    const forged = structuredClone(witness)
    forged.deltaCents += 1
    failure(createImpactProof(experiment.oldContract, experiment.newContract, forged, searchOptions), 'witness_mismatch')
  })
})

describe('proof tampering and constraints', () => {
  const source = formalCases[1]!.proof

  it.each([
    ['original purchase amount', (proof: ImpactProof) => { proof.originalScenario.transactions[0]!.amountCents += 100 }],
    ['minimized purchase amount', (proof: ImpactProof) => { proof.minimizedScenario.transactions[0]!.amountCents += 100 }],
    ['old contract fee', (proof: ImpactProof) => { proof.oldContract.rules.transactionFee!.fixedCents += 1 }],
    ['new contract basis points', (proof: ImpactProof) => { proof.newContract.rules.transactionFee!.rateBps += 1 }],
    ['original old total', (proof: ImpactProof) => { proof.originalComparison.oldEvaluation.totalCents += 1 }],
    ['original new total', (proof: ImpactProof) => { proof.originalComparison.newEvaluation.totalCents += 1 }],
    ['minimized old total', (proof: ImpactProof) => { proof.minimizedComparison.oldEvaluation.totalCents += 1 }],
    ['minimized new total', (proof: ImpactProof) => { proof.minimizedComparison.newEvaluation.totalCents += 1 }],
    ['original delta', (proof: ImpactProof) => { proof.originalComparison.deltaCents += 1 }],
    ['minimized delta', (proof: ImpactProof) => { proof.minimizedComparison.deltaCents += 1 }],
    ['category delta', (proof: ImpactProof) => { proof.minimizedComparison.deltaByCategoryCents.transactionFeeCents += 1 }],
    ['original trace', (proof: ImpactProof) => { proof.originalComparison.oldEvaluation.trace = [] }],
    ['minimized trace', (proof: ImpactProof) => { proof.minimizedComparison.newEvaluation.trace = [] }],
    ['step comparison', (proof: ImpactProof) => { proof.reductionSteps[0]!.comparison.deltaCents += 1 }],
    ['step validation delta', (proof: ImpactProof) => { proof.reductionSteps[0]!.validation.deltaCents += 1 }],
    ['step objective', (proof: ImpactProof) => { proof.reductionSteps[0]!.validation.objective.purchaseTotalCents += 1 }],
    ['step chain', (proof: ImpactProof) => { proof.reductionSteps[0]!.before.transactions[0]!.amountCents += 1 }],
    ['step edit type', (proof: ImpactProof) => { proof.reductionSteps[0]!.type = 'reduce-payment-delay' }],
    ['missing reduction history', (proof: ImpactProof) => { proof.reductionSteps = [] }],
  ] as const)('rejects tampered %s', (_label, tamper) => {
    const proof = structuredClone(source)
    tamper(proof)
    failure(verifyImpactProof(proof))
    failure(formatImpactReport(proof))
  })

  it.each([
    ['removed payment', (proof: ImpactProof) => { proof.minimizedScenario.paymentEvents = [] }],
    ['payment ID', (proof: ImpactProof) => { proof.minimizedScenario.paymentEvents[0]!.id = 'changed-payment' }],
    ['payment due date', (proof: ImpactProof) => { proof.minimizedScenario.paymentEvents[0]!.dueOn = '2026-05-14' }],
    ['payment amount', (proof: ImpactProof) => { proof.minimizedScenario.paymentEvents[0]!.amountCents += 1 }],
  ] as const)('rejects changed obligation %s even with refreshed financial comparison', (_label, tamper) => {
    const proof = structuredClone(formalCases[2]!.proof)
    tamper(proof)
    proof.minimizedComparison = recalculated(proof, proof.minimizedScenario)
    failure(verifyImpactProof(proof), 'invariant_violation')
  })

  it('rejects a changed billing month even when all purchases and totals remain valid', () => {
    const proof = structuredClone(formalCases[2]!.proof)
    proof.minimizedScenario.billingMonth = '2026-06'
    proof.minimizedComparison = recalculated(proof, proof.minimizedScenario)
    failure(verifyImpactProof(proof), 'invariant_violation')
  })

  it('rejects an increased objective even after recalculating the enlarged scenario', () => {
    const proof = structuredClone(formalCases[2]!.proof)
    proof.searchOptions.purchaseCountMax = 12
    proof.minimizedScenario = structuredClone(proof.originalScenario)
    proof.minimizedScenario.transactions.push({ id: 'added-purchase', occurredOn: '2026-05-01', amountCents: 100, kind: 'purchase' })
    proof.minimizedComparison = recalculated(proof, proof.minimizedScenario)
    const result = verifyImpactProof(proof)
    failure(result, 'invariant_violation')
    if (!result.success) expect(result.issues.some((issue) => issue.path.includes('objective'))).toBe(true)
  })

  it('rejects a larger payment delay even if the late fee remains the same', () => {
    const proof = structuredClone(formalCases[2]!.proof)
    proof.minimizedScenario.paymentEvents[0]!.paidOn = '2026-05-18'
    proof.minimizedComparison = recalculated(proof, proof.minimizedScenario)
    expect(proof.minimizedComparison.deltaCents).toBe(1500)
    failure(verifyImpactProof(proof), 'invariant_violation')
  })

  it('rejects a zero counterexample after financial values are consistently recalculated', () => {
    const proof = structuredClone(source)
    proof.minimizedScenario.transactions = []
    proof.minimizedComparison = recalculated(proof, proof.minimizedScenario)
    expect(proof.minimizedComparison.deltaCents).toBe(0)
    failure(verifyImpactProof(proof), 'proof_mismatch')
  })

  it.each([
    { maxChecks: 0 }, { maxChecks: 301 }, { checksPerformed: 0 },
    { checksPerformed: 300, maxChecks: 200 }, { budgetExhausted: true },
    { terminationReason: 'budget-exhausted' }, { extra: true },
  ])('rejects inconsistent or invalid minimization budget %#', (budget) => {
    const proof = structuredClone(source)
    failure(verifyImpactProof({ ...proof, minimizationBudget: { ...proof.minimizationBudget, ...budget } }))
  })

  it('rejects a forged proof that overflows on original recomputation', () => {
    const proof = structuredClone(source)
    proof.oldContract.rules.transactionFee = { fixedCents: Number.MAX_SAFE_INTEGER, rateBps: 10000 }
    failure(verifyImpactProof(proof), 'overflow')
  })
})

describe('untrusted proof schema', () => {
  const proof = formalCases[1]!.proof

  it.each([null, false, 'proof', 1, [], {}, { ...proof, extra: true }])('rejects malformed proof %#', (input) => {
    failure(verifyImpactProof(input), 'validation_error')
  })

  it.each([
    { proofSchemaVersion: 2 }, { engineVersion: 'unknown-engine' }, { minimizerVersion: 'unknown-minimizer' },
    { searchOptions: { ...searchOptions, extra: true } },
    { oldContract: { ...proof.oldContract, currency: 'EUR' } },
    { newContract: { ...proof.newContract, schemaVersion: 2 } },
    { calculationPolicy: { ...proof.calculationPolicy, currency: 'EUR' } },
    { limitations: [] },
  ])('rejects unsupported version, policy or malformed nested model %#', (modified) => {
    failure(verifyImpactProof({ ...proof, ...modified }), 'validation_error')
  })

  it.each(['2026-02-30', '2026-05-32', '0000-01-01'])('rejects invalid proof date %s', (occurredOn) => {
    const altered = structuredClone(proof)
    altered.originalScenario.transactions[0]!.occurredOn = occurredOn
    failure(verifyImpactProof(altered), 'validation_error')
  })

  it('rejects retained amounts that breach recorded search bounds', () => {
    const altered = structuredClone(proof)
    altered.searchOptions.purchaseAmountCentsMin = 200
    failure(verifyImpactProof(altered), 'out_of_bounds')
  })

  it('rejects excessive step histories before parsing their contents', () => {
    const history = Array.from({ length: 300 }, () => null)
    Object.defineProperty(history, 0, { get: () => { throw new Error('Oversized history contents must not be accessed.') } })
    failure(verifyImpactProof({ ...proof, reductionSteps: history }), 'validation_error')
  })
})

describe('Markdown impact report from recalculated evidence', () => {
  it.each(formalCases)('reports actual before/after finances for $experiment.name', ({ proof, witness }) => {
    const report = success(formatImpactReport(proof))
    for (const section of ['Financial Experiment', 'Original Scenario', 'Minimized Scenario', 'Old Contract Total',
      'New Contract Total', 'Cost Difference', 'Rule-Level Impact', 'Reduction Summary', 'Reproduction Information', 'Limitations']) {
      expect(report).toContain(section)
    }
    expect(report).toContain(proof.oldContract.name)
    expect(report).toContain(proof.newContract.name)
    expect(report).toContain(`Witness ${witness.candidateId}`)
    expect(report).toContain(`Search seed: ${searchOptions.seed}`)
    expect(report).toContain(`Purchases: ${proof.originalScenario.transactions.length} → ${proof.minimizedScenario.transactions.length}`)
    expect(report).toContain(`${proof.minimizationBudget.checksPerformed}/${proof.minimizationBudget.maxChecks}`)
    expect(report).toContain('verifyImpactProof(proof)')
    expect(report).toContain('round half up separately for each transaction')
    expect(report).toContain('not a proof of a globally minimal counterexample')
    expect(report).toContain('no digital signature')
  })

  it('reports the actual 10-to-1 microtransaction fee decrease and per-transaction rounding trace', () => {
    const report = success(formatImpactReport(formalCases[1]!.proof))
    expect(report).toContain('| Old Contract Total | $0.01 |')
    expect(report).toContain('| New Contract Total | $0.21 |')
    expect(report).toContain('| Cost Difference (new minus old) | +$0.20 |')
    expect(report).toContain('Cost difference: +$2.00 → +$0.20.')
    expect(report).toContain('rounded variable fee $0.01, fixed fee $0.20, charged $0.21')
    expect(report).toContain('| Transaction fee | $0.01 | $0.21 | +$0.20 |')
  })

  it('reports both the retained obligation and the actual two-day grace-period impact', () => {
    const report = success(formatImpactReport(formalCases[2]!.proof))
    expect(report).toContain('0 purchases')
    expect(report).toContain('grace-payment-1')
    expect(report).toContain('2026-05-15')
    expect(report).toContain('2026-05-17')
    expect(report).toContain('2 late days, 1 grace days, grace exceeded, charged $15.00')
    expect(report).toContain('| Late fee | $0.00 | $15.00 | +$15.00 |')
  })

  it('formats maximum safe cents exactly without floating-point loss of the cent digit', () => {
    const template = structuredClone(formalCases[1]!.experiment.oldContract)
    const old: Contract = { ...template, id: 'large-old', rules: { transactionFee: { fixedCents: Number.MAX_SAFE_INTEGER, rateBps: 0 } } }
    const next: Contract = { ...template, id: 'large-new', rules: { transactionFee: { fixedCents: Number.MAX_SAFE_INTEGER - 1, rateBps: 0 } } }
    const original = structuredClone(formalCases[1]!.proof.minimizedScenario)
    const comparison = compareContracts(old, next, original)
    if (!comparison.success) throw new Error(JSON.stringify(comparison.issues))
    const witness: Witness = { candidateId: 'base-0', sequence: 0, source: 'base', scenario: original,
      comparison: comparison.data, deltaCents: comparison.data.deltaCents }
    const proof = success(createImpactProof(old, next, witness, { ...searchOptions, purchaseCountMin: 1 }))
    const report = success(formatImpactReport(proof))
    expect(report).toContain('| Old Contract Total | $90071992547409.91 |')
    expect(report).toContain('| New Contract Total | $90071992547409.90 |')
    expect(report).toContain('| Cost Difference (new minus old) | -$0.01 |')
  })

  it('escapes user-supplied Markdown characters while retaining real contract content', () => {
    const { experiment, witness } = formalCases[1]!
    const old = { ...experiment.oldContract, name: 'Synthetic [old] | *contract*' }
    const next = { ...experiment.newContract, name: 'Synthetic <new> # contract' }
    const proof = success(createImpactProof(old, next, witness, searchOptions))
    const report = success(formatImpactReport(proof))
    expect(report).toContain('Synthetic \\[old\\] \\| \\*contract\\*')
    expect(report).toContain('Synthetic \\<new\\> \\# contract')
  })
})
