import { describe, expect, it, vi } from 'vitest'
import * as engine from '../engine'
import { calendarDaysBetween } from '../engine/dates'
import { validateScenario, type Contract, type Scenario } from '../models'
import { experiments, type ExperimentFixture } from '../scenarios'
import { searchCounterexamples, type SearchOptions, type Witness } from '../search'
import { minimizeWitness } from './index'
import type { EvidenceResult, MinimizationResult } from './types'

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
  if (result.success) throw new Error('Expected a structured failure.')
  expect(result.issues.length).toBeGreaterThan(0)
  if (code) expect(result.issues.some((issue) => issue.code === code)).toBe(true)
  for (const issue of result.issues) {
    expect(Array.isArray(issue.path)).toBe(true)
    expect(issue.message.length).toBeGreaterThan(0)
  }
}

function searchedWitness(experiment: ExperimentFixture, minimumCount: number): Witness {
  const base = structuredClone(experiment.scenario)
  base.transactions = []
  base.paymentEvents = base.paymentEvents.map((payment) => ({ ...payment, paidOn: payment.dueOn }))
  const result = searchCounterexamples(experiment.oldContract, experiment.newContract, base, searchOptions)
  if (!result.success) throw new Error(JSON.stringify(result.issues))
  const found = result.data.witnesses.find((witness) => witness.scenario.transactions.length >= minimumCount)
  if (!found) throw new Error(`The actual search did not retain the required ${experiment.name} witness.`)
  return found
}

const formalCases = experiments.map((experiment, index) => ({
  experiment,
  witness: searchedWitness(experiment, index === 0 ? 6 : 2),
}))

function contract(rules: Contract['rules']): Contract {
  return {
    schemaVersion: 1, id: 'minimizer-contract', name: 'Synthetic minimization test contract',
    version: '1.0.0', currency: 'USD', billingCycle: 'calendar-month', effectiveDate: '2026-06-01', rules,
  }
}

function scenario(amounts: number[], payments: Scenario['paymentEvents'] = []): Scenario {
  return {
    schemaVersion: 1, id: 'minimizer-scenario', billingMonth: '2026-05',
    transactions: amounts.map((amountCents, index) => ({
      id: `purchase-${index + 1}`, occurredOn: '2026-05-01', kind: 'purchase', amountCents,
    })),
    paymentEvents: payments,
  }
}

function witnessFor(oldContract: Contract, newContract: Contract, input: Scenario): Witness {
  const comparison = engine.compareContracts(oldContract, newContract, input)
  if (!comparison.success) throw new Error(JSON.stringify(comparison.issues))
  return { candidateId: 'base-0', sequence: 0, source: 'base', scenario: input,
    comparison: comparison.data, deltaCents: comparison.data.deltaCents }
}

function frozen<T>(input: T): T {
  if (input !== null && typeof input === 'object') {
    Object.values(input).forEach((child: unknown) => frozen(child))
    Object.freeze(input)
  }
  return input
}

function assertResult(result: MinimizationResult, oldContract: Contract, newContract: Contract, witness: Witness,
  options = searchOptions) {
  expect(result.originalWitnessId).toBe(witness.candidateId)
  expect(result.originalScenario).toEqual(witness.scenario)
  expect(result.originalComparison).toEqual(witness.comparison)
  expect(result.originalDeltaCents).toBe(witness.deltaCents)
  expect(result.originalDeltaCents).not.toBe(0)
  expect(result.minimizedDeltaCents).not.toBe(0)
  expect(Math.sign(result.minimizedDeltaCents)).toBe(Math.sign(result.originalDeltaCents))
  expect(result.minimizedScenario.billingMonth).toBe(witness.scenario.billingMonth)
  expect(result.minimizedScenario.id).toBe(witness.scenario.id)
  expect(result.checksPerformed).toBeGreaterThanOrEqual(1)
  expect(result.checksPerformed).toBeLessThanOrEqual(result.minimizationOptions.maxChecks)
  expect(result.minimizationOptions.maxChecks).toBeLessThanOrEqual(300)
  const scenarios = [result.minimizedScenario, ...result.reductionSteps.map((step) => step.after)]
  for (const candidate of scenarios) {
    expect(validateScenario(candidate).success).toBe(true)
    expect(candidate.transactions.length).toBeGreaterThanOrEqual(options.purchaseCountMin)
    expect(candidate.transactions.length).toBeLessThanOrEqual(options.purchaseCountMax)
    for (const purchase of candidate.transactions) {
      expect(purchase.amountCents).toBeGreaterThanOrEqual(options.purchaseAmountCentsMin)
      expect(purchase.amountCents).toBeLessThanOrEqual(options.purchaseAmountCentsMax)
      const original = witness.scenario.transactions.find((item) => item.id === purchase.id)
      expect(original).toBeDefined()
      expect(purchase.occurredOn).toBe(original?.occurredOn)
      expect(purchase.amountCents).toBeLessThanOrEqual(original!.amountCents)
    }
    expect(candidate.paymentEvents).toHaveLength(witness.scenario.paymentEvents.length)
    candidate.paymentEvents.forEach((payment, index) => {
      const original = witness.scenario.paymentEvents[index]!
      expect(payment.id).toBe(original.id)
      expect(payment.dueOn).toBe(original.dueOn)
      expect(payment.amountCents).toBe(original.amountCents)
      const days = Math.max(0, calendarDaysBetween(payment.dueOn, payment.paidOn))
      expect(days).toBeGreaterThanOrEqual(options.lateDaysMin)
      expect(days).toBeLessThanOrEqual(options.lateDaysMax)
    })
  }
  expect(engine.compareContracts(oldContract, newContract, result.minimizedScenario))
    .toEqual({ success: true, data: result.minimizedComparison })
  let previous = result.originalScenario
  for (const step of result.reductionSteps) {
    expect(step.before).toEqual(previous)
    expect(step.validation.success).toBe(true)
    expect(step.validation.deltaCents).not.toBe(0)
    expect(Math.sign(step.validation.deltaCents)).toBe(Math.sign(result.originalDeltaCents))
    expect(engine.compareContracts(oldContract, newContract, step.after))
      .toEqual({ success: true, data: step.comparison })
    expect(step.comparison.deltaCents).toBe(step.validation.deltaCents)
    expect(step.reason.length).toBeGreaterThan(0)
    previous = step.after
  }
  expect(previous).toEqual(result.minimizedScenario)
  expect(JSON.parse(JSON.stringify(result))).toEqual(result)
}

describe('Stage 4B formal counterexample reductions', () => {
  it.each(formalCases)('reduces a real searched $experiment.name witness while preserving computed impact',
    ({ experiment, witness }) => {
      const result = success(minimizeWitness(experiment.oldContract, experiment.newContract, witness, searchOptions))
      assertResult(result, experiment.oldContract, experiment.newContract, witness)
      expect(result.reductionSteps.length).toBeGreaterThan(0)
      expect(result.budgetExhausted).toBe(false)
      expect(result.terminationReason).toBe('strategy-complete')
      const expectedCounts = [5, 1, 0]
      const index = experiments.indexOf(experiment)
      expect(result.minimizedScenario.transactions).toHaveLength(expectedCounts[index]!)
      if (index === 0) {
        expect(result.minimizedScenario.transactions.map((item) => item.amountCents)).toEqual([100, 100, 100, 100, 100])
        expect(result.minimizedComparison.oldEvaluation.totalCents).toBe(0)
        expect(result.minimizedComparison.newEvaluation.totalCents).toBe(1200)
        expect(result.minimizedDeltaCents).toBe(1200)
      } else if (index === 1) {
        expect(result.minimizedScenario.transactions[0]?.amountCents).toBe(100)
        expect(result.minimizedComparison.oldEvaluation.totalCents).toBe(1)
        expect(result.minimizedComparison.newEvaluation.totalCents).toBe(21)
        expect(result.minimizedDeltaCents).toBe(20)
        expect(result.minimizedDeltaCents).toBeLessThan(result.originalDeltaCents)
      } else {
        expect(result.minimizedScenario.paymentEvents).toEqual(experiment.scenario.paymentEvents)
        expect(result.minimizedComparison.oldEvaluation.totalCents).toBe(0)
        expect(result.minimizedComparison.newEvaluation.totalCents).toBe(1500)
        expect(result.minimizedDeltaCents).toBe(1500)
      }
    })

  it('preserves negative impact when the formal old and new contracts are reversed', () => {
    const { experiment, witness } = formalCases[1]!
    const reversed = witnessFor(experiment.newContract, experiment.oldContract, witness.scenario)
    const result = success(minimizeWitness(experiment.newContract, experiment.oldContract, reversed, searchOptions))
    assertResult(result, experiment.newContract, experiment.oldContract, reversed)
    expect(result.originalDeltaCents).toBeLessThan(0)
    expect(result.minimizedDeltaCents).toBe(-20)
    expect(result.minimizedScenario.transactions).toHaveLength(1)
  })

  it('does not remove the last purchase when removal would erase the counterexample', () => {
    const { experiment } = formalCases[1]!
    const witness = witnessFor(experiment.oldContract, experiment.newContract, scenario([100]))
    const result = success(minimizeWitness(experiment.oldContract, experiment.newContract, witness, searchOptions))
    expect(result.minimizedScenario).toEqual(witness.scenario)
    expect(result.minimizedDeltaCents).toBe(20)
    expect(result.reductionSteps).toEqual([])
    expect(result.terminationReason).toBe('strategy-complete')
  })

  it('honors the minimum purchase count even where deleting more transactions would preserve impact', () => {
    const { experiment, witness } = formalCases[1]!
    const options = { ...searchOptions, purchaseCountMin: 3 }
    const result = success(minimizeWitness(experiment.oldContract, experiment.newContract, witness, options))
    assertResult(result, experiment.oldContract, experiment.newContract, witness, options)
    expect(result.minimizedScenario.transactions).toHaveLength(3)
    expect(result.minimizedDeltaCents).toBe(60)
  })

  it('honors the minimum purchase amount and late-day bounds', () => {
    const { experiment, witness } = formalCases[2]!
    const options = { ...searchOptions, lateDaysMin: 2, purchaseCountMin: 1 }
    const result = success(minimizeWitness(experiment.oldContract, experiment.newContract, witness, options))
    assertResult(result, experiment.oldContract, experiment.newContract, witness, options)
    expect(result.minimizedScenario.transactions).toHaveLength(1)
    expect(result.minimizedScenario.transactions[0]?.amountCents).toBe(100)
    expect(result.minimizedScenario.paymentEvents[0]?.paidOn).toBe('2026-05-17')
  })

  it('keeps successful original witness metadata from the unchanged Stage 4A search', () => {
    const { experiment, witness } = formalCases[0]!
    const repeated = searchedWitness(experiment, 6)
    expect(repeated).toEqual(witness)
    expect(witness.source).not.toBe('base')
    expect(witness.parameters).toBeDefined()
    expect(witness.comparison.deltaCents).toBe(1200)
  })
})

describe('bounded deterministic minimization', () => {
  it.each([1, 2, 3, 5, 10, 200, 300])('never exceeds a %i-comparison budget', (maxChecks) => {
    const { experiment, witness } = formalCases[1]!
    const spy = vi.spyOn(engine, 'compareContracts')
    try {
      const result = success(minimizeWitness(experiment.oldContract, experiment.newContract, witness, searchOptions, { maxChecks }))
      expect(result.checksPerformed).toBeLessThanOrEqual(maxChecks)
      expect(result.checksPerformed).toBe(spy.mock.calls.length)
      expect(result.minimizationOptions).toEqual({ maxChecks })
      expect(result.minimizedDeltaCents).not.toBe(0)
      const comparedScenarios = spy.mock.calls.map((call) => JSON.stringify(call[2]))
      expect(new Set(comparedScenarios).size).toBe(comparedScenarios.length)
    } finally { spy.mockRestore() }
  })

  it('returns the original verified witness when the single-check budget is exhausted', () => {
    const { experiment, witness } = formalCases[1]!
    const result = success(minimizeWitness(experiment.oldContract, experiment.newContract, witness, searchOptions, { maxChecks: 1 }))
    expect(result.checksPerformed).toBe(1)
    expect(result.budgetExhausted).toBe(true)
    expect(result.terminationReason).toBe('budget-exhausted')
    expect(result.minimizedScenario).toEqual(witness.scenario)
    expect(result.minimizedComparison).toEqual(witness.comparison)
    expect(result.reductionSteps).toEqual([])
  })

  it('retains already accepted reductions when a later check exhausts the budget', () => {
    const { experiment, witness } = formalCases[1]!
    const result = success(minimizeWitness(experiment.oldContract, experiment.newContract, witness, searchOptions, { maxChecks: 3 }))
    expect(result.checksPerformed).toBe(3)
    expect(result.budgetExhausted).toBe(true)
    expect(result.reductionSteps).toHaveLength(1)
    expect(result.minimizedScenario.transactions.length).toBeLessThan(witness.scenario.transactions.length)
    expect(result.minimizedDeltaCents).toBeGreaterThan(0)
  })

  it('defaults to 200 checks for omitted or empty minimization options', () => {
    const { experiment, witness } = formalCases[1]!
    const absent = success(minimizeWitness(experiment.oldContract, experiment.newContract, witness, searchOptions))
    const empty = success(minimizeWitness(experiment.oldContract, experiment.newContract, witness, searchOptions, {}))
    expect(absent.minimizationOptions).toEqual({ maxChecks: 200 })
    expect(empty).toEqual(absent)
  })

  it('is repeatable and does not mutate deeply frozen contracts, witness or options', () => {
    const { experiment, witness } = formalCases[2]!
    const inputs = frozen(structuredClone({ old: experiment.oldContract, new: experiment.newContract,
      witness, options: searchOptions, minimization: { maxChecks: 200 } }))
    const before = JSON.stringify(inputs)
    const a = minimizeWitness(inputs.old, inputs.new, inputs.witness, inputs.options, inputs.minimization)
    const b = minimizeWitness(inputs.old, inputs.new, inputs.witness, inputs.options, inputs.minimization)
    expect(a).toEqual(b)
    expect(JSON.stringify(inputs)).toBe(before)
    expect(a.success).toBe(true)
  })

  it('can independently lower nonuniform retained purchase amounts', () => {
    const old = contract({ transactionFee: { fixedCents: 0, rateBps: 0 } })
    const next = contract({ transactionFee: { fixedCents: 1, rateBps: 0 } })
    const witness = witnessFor(old, next, scenario([800, 650, 900]))
    const options = { ...searchOptions, purchaseCountMin: 3 }
    const result = success(minimizeWitness(old, next, witness, options))
    expect(result.minimizedScenario.transactions.map((item) => item.amountCents)).toEqual([100, 100, 100])
    expect(result.minimizedDeltaCents).toBe(3)
    assertResult(result, old, next, witness, options)
  })

  it('keeps already early completed payments unchanged', () => {
    const old = contract({ transactionFee: { fixedCents: 0, rateBps: 0 } })
    const next = contract({ transactionFee: { fixedCents: 20, rateBps: 0 } })
    const payment = { id: 'early-payment', dueOn: '2026-06-01', paidOn: '2026-05-31', amountCents: 1000 }
    const witness = witnessFor(old, next, scenario([500, 500], [payment]))
    const result = success(minimizeWitness(old, next, witness, searchOptions))
    expect(result.minimizedScenario.paymentEvents).toEqual([payment])
    expect(result.minimizedDeltaCents).toBe(20)
    expect(result.minimizedObjective.totalLateDays).toBe(0)
  })

  it('reduces cross-month late dates using calendar days', () => {
    const old = contract({ lateFee: { feeCents: 0, graceDays: 0 } })
    const next = contract({ lateFee: { feeCents: 1500, graceDays: 1 } })
    const payment = { id: 'cross-month-payment', dueOn: '2026-05-31', paidOn: '2026-06-05', amountCents: 1000 }
    const witness = witnessFor(old, next, scenario([], [payment]))
    const result = success(minimizeWitness(old, next, witness, searchOptions))
    expect(result.minimizedScenario.paymentEvents).toEqual([{ ...payment, paidOn: '2026-06-02' }])
    expect(result.minimizedDeltaCents).toBe(1500)
  })

  it('safely preserves payment dates at the end of the supported calendar', () => {
    const old = contract({ lateFee: { feeCents: 0, graceDays: 0 } })
    const next = contract({ lateFee: { feeCents: 1, graceDays: 0 } })
    const payment = { id: 'last-calendar-payment', dueOn: '9999-12-30', paidOn: '9999-12-31', amountCents: 100 }
    const witness = witnessFor(old, next, scenario([], [payment]))
    const result = success(minimizeWitness(old, next, witness, searchOptions))
    expect(result.minimizedScenario.paymentEvents).toEqual([payment])
    expect(result.minimizedDeltaCents).toBe(1)
  })

  it('safely records overflow candidates while retaining a verified nonzero witness', () => {
    const old = contract({
      monthlyFee: { feeCents: Number.MAX_SAFE_INTEGER, waiver: { kind: 'minPurchaseTotalCents', threshold: 300 } },
      transactionFee: { fixedCents: Number.MAX_SAFE_INTEGER, rateBps: 0 },
    })
    const next = contract({
      monthlyFee: { feeCents: 0, waiver: { kind: 'minPurchaseTotalCents', threshold: 300 } },
      transactionFee: { fixedCents: Number.MAX_SAFE_INTEGER - 1, rateBps: 0 },
    })
    const witness = witnessFor(old, next, scenario([300]))
    const options = { ...searchOptions, purchaseCountMin: 1 }
    const result = success(minimizeWitness(old, next, witness, options, { maxChecks: 50 }))
    expect(result.minimizedDeltaCents).toBe(-1)
    expect(result.minimizedScenario.transactions[0]?.amountCents).toBe(300)
    expect(result.candidateFailures.some((item) => item.issues.some((issue) => issue.code === 'overflow'))).toBe(true)
    expect(engine.compareContracts(old, next, result.minimizedScenario)).toEqual({ success: true, data: result.minimizedComparison })
  })

  it('does not accept a zero or reversed delta encountered in lower amount probes', () => {
    const old = contract({ transactionFee: { fixedCents: 1, rateBps: 0 } })
    const next = contract({ transactionFee: { fixedCents: 0, rateBps: 100 } })
    const witness = witnessFor(old, next, scenario([350]))
    const options = { ...searchOptions, purchaseCountMin: 1, purchaseAmountCentsMin: 1 }
    const result = success(minimizeWitness(old, next, witness, options))
    expect(result.minimizedDeltaCents).toBeGreaterThan(0)
    expect(result.minimizedScenario.transactions[0]!.amountCents).toBeGreaterThanOrEqual(150)
    for (const step of result.reductionSteps) expect(step.comparison.deltaCents).toBeGreaterThan(0)
  })

  it('handles nonmonotonic half-cent rounding bands without assuming an amount threshold', () => {
    const old = contract({ transactionFee: { fixedCents: 0, rateBps: 6666 } })
    const next = contract({ transactionFee: { fixedCents: 0, rateBps: 6667 } })
    const witness = witnessFor(old, next, scenario([7502]))
    const options = { ...searchOptions, purchaseCountMin: 1, purchaseAmountCentsMin: 7485, purchaseAmountCentsMax: 7502 }
    const result = success(minimizeWitness(old, next, witness, options))
    expect(engine.compareContracts(old, next, scenario([7485]))).toMatchObject({ success: true, data: { deltaCents: 0 } })
    expect(engine.compareContracts(old, next, scenario([7486]))).toMatchObject({ success: true, data: { deltaCents: 1 } })
    expect(engine.compareContracts(old, next, scenario([7488]))).toMatchObject({ success: true, data: { deltaCents: 0 } })
    expect(result.minimizedScenario.transactions[0]?.amountCents).toBe(7486)
    expect(result.minimizedDeltaCents).toBe(1)
  })

  it('finds a lower interior amount after the lower bound erases a nonmonotonic difference', () => {
    const old = contract({ transactionFee: { fixedCents: 0, rateBps: 6667 } })
    const next = contract({ transactionFee: { fixedCents: 0, rateBps: 7500 } })
    const witness = witnessFor(old, next, scenario([5]))
    const options = { ...searchOptions, purchaseCountMax: 1, purchaseAmountCentsMin: 1, purchaseAmountCentsMax: 5 }
    const result = success(minimizeWitness(old, next, witness, options))
    expect(engine.compareContracts(old, next, scenario([1]))).toMatchObject({ success: true, data: { deltaCents: 0 } })
    expect(engine.compareContracts(old, next, scenario([3]))).toMatchObject({ success: true, data: { deltaCents: 0 } })
    expect(result.minimizedScenario.transactions[0]?.amountCents).toBe(2)
    expect(result.minimizedDeltaCents).toBe(1)
  })

  it('does not read current time or random state while minimizing a valid witness', () => {
    const { experiment, witness } = formalCases[2]!
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Random state is forbidden.') })
    const now = vi.spyOn(Date, 'now').mockImplementation(() => { throw new Error('Current time is forbidden.') })
    try {
      expect(minimizeWitness(experiment.oldContract, experiment.newContract, witness, searchOptions).success).toBe(true)
      expect(random).not.toHaveBeenCalled()
      expect(now).not.toHaveBeenCalled()
    } finally { random.mockRestore(); now.mockRestore() }
  })

  it('retains every payment obligation when only one remaining late fee is needed for impact', () => {
    const old = contract({ lateFee: { feeCents: 1500, graceDays: 3 } })
    const next = contract({ lateFee: { feeCents: 1500, graceDays: 1 } })
    const payments = [
      { id: 'obligation-1', dueOn: '2026-05-15', paidOn: '2026-05-18', amountCents: 1000 },
      { id: 'obligation-2', dueOn: '2026-05-20', paidOn: '2026-05-23', amountCents: 2000 },
    ]
    const witness = witnessFor(old, next, scenario([900], payments))
    const result = success(minimizeWitness(old, next, witness, searchOptions))
    assertResult(result, old, next, witness)
    expect(result.minimizedScenario.paymentEvents.map(({ id, dueOn, amountCents }) => ({ id, dueOn, amountCents })))
      .toEqual(payments.map(({ id, dueOn, amountCents }) => ({ id, dueOn, amountCents })))
    expect(result.originalDeltaCents).toBe(3000)
    expect(result.minimizedDeltaCents).toBe(1500)
  })
})

describe('untrusted minimizer inputs', () => {
  const { experiment, witness } = formalCases[1]!

  it.each([null, false, 'witness', 3, [], {}, { ...witness, surprise: true }])('rejects malformed or non-strict witness %#', (input) => {
    failure(minimizeWitness(experiment.oldContract, experiment.newContract, input, searchOptions), 'validation_error')
  })

  it.each([
    ['delta', (input: Witness) => { input.deltaCents += 1 }],
    ['comparison delta', (input: Witness) => { input.comparison.deltaCents += 1 }],
    ['old total', (input: Witness) => { input.comparison.oldEvaluation.totalCents += 1 }],
    ['new total', (input: Witness) => { input.comparison.newEvaluation.totalCents += 1 }],
    ['category impact', (input: Witness) => { input.comparison.deltaByCategoryCents.transactionFeeCents += 1 }],
    ['trace', (input: Witness) => { input.comparison.newEvaluation.trace = [] }],
    ['valid scenario amount', (input: Witness) => { input.scenario.transactions[0]!.amountCents += 100 }],
  ] as const)('rejects forged recorded %s', (_label, tamper) => {
    const input = structuredClone(witness)
    tamper(input)
    failure(minimizeWitness(experiment.oldContract, experiment.newContract, input, searchOptions), 'witness_mismatch')
  })

  it('rejects a valid recalculated zero-delta witness', () => {
    const zero = witnessFor(experiment.oldContract, experiment.oldContract, witness.scenario)
    failure(minimizeWitness(experiment.oldContract, experiment.oldContract, zero, searchOptions), 'not_counterexample')
  })

  it.each([-1, 0, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects purchase amount %s', (amountCents) => {
    const input = structuredClone(witness)
    input.scenario.transactions[0]!.amountCents = amountCents
    failure(minimizeWitness(experiment.oldContract, experiment.newContract, input, searchOptions), 'validation_error')
  })

  it.each(['2026-02-30', '2026-13-01', '0000-01-01', '2026-5-01', '2026-06-01'])('rejects invalid or out-of-month purchase date %s', (date) => {
    const input = structuredClone(witness)
    input.scenario.transactions[0]!.occurredOn = date
    failure(minimizeWitness(experiment.oldContract, experiment.newContract, input, searchOptions), 'validation_error')
  })

  it('rejects repeated purchase IDs', () => {
    const input = structuredClone(witness)
    input.scenario.transactions[1]!.id = input.scenario.transactions[0]!.id
    failure(minimizeWitness(experiment.oldContract, experiment.newContract, input, searchOptions), 'validation_error')
  })

  it.each(['2026-02-30', '0000-01-01', '10000-01-01'])('rejects invalid payment completion date %s', (paidOn) => {
    const input = structuredClone(formalCases[2]!.witness)
    input.scenario.paymentEvents[0]!.paidOn = paidOn
    failure(minimizeWitness(formalCases[2]!.experiment.oldContract, formalCases[2]!.experiment.newContract, input, searchOptions), 'validation_error')
  })

  it.each([
    { source: 'api' }, { candidateId: '  ' }, { sequence: -1 }, { sequence: 1.5 },
    { parameters: { purchaseCount: 1, purchaseAmountCents: 100, lateDays: 0, extra: true } },
  ])('rejects invalid witness source metadata %#', (metadata) => {
    failure(minimizeWitness(experiment.oldContract, experiment.newContract, { ...witness, ...metadata }, searchOptions), 'validation_error')
  })

  it.each([null, -1, 0, 301, 1.5, NaN, Infinity, { maxChecks: 200, extra: true }])('rejects invalid minimization options %#', (input) => {
    const options = typeof input === 'number' ? { maxChecks: input } : input
    failure(minimizeWitness(experiment.oldContract, experiment.newContract, witness, searchOptions, options), 'validation_error')
  })

  it.each([
    { ...searchOptions, purchaseCountMax: 1 },
    { ...searchOptions, purchaseAmountCentsMin: 500, purchaseAmountCentsMax: 1000 },
  ])('rejects witnesses outside the supplied search bounds %#', (options) => {
    failure(minimizeWitness(experiment.oldContract, experiment.newContract, witness, options), 'out_of_bounds')
  })

  it('rejects malformed search options rather than silently defaulting them', () => {
    failure(minimizeWitness(experiment.oldContract, experiment.newContract, witness, { ...searchOptions, extra: true }), 'validation_error')
  })

  it('rejects an invalid contract before attempting reductions', () => {
    const old = { ...experiment.oldContract, currency: 'EUR' }
    failure(minimizeWitness(old, experiment.newContract, witness, searchOptions), 'validation_error')
  })

  it('returns structured overflow if the original witness no longer recomputes safely', () => {
    const old = contract({ transactionFee: { fixedCents: Number.MAX_SAFE_INTEGER, rateBps: 10000 } })
    failure(minimizeWitness(old, experiment.newContract, witness, searchOptions), 'overflow')
  })

  it('rejects oversized witness transaction arrays without truncating them', () => {
    const input = structuredClone(witness)
    input.scenario.transactions = scenario(Array.from({ length: 31 }, () => 100)).transactions
    failure(minimizeWitness(experiment.oldContract, experiment.newContract, input, { ...searchOptions, purchaseCountMax: 30 }), 'validation_error')
  })

  it('accepts the last possible Stage 4A candidate sequence and rejects sequence excess', () => {
    expect(minimizeWitness(experiment.oldContract, experiment.newContract, { ...witness, sequence: 2512 }, searchOptions).success).toBe(true)
    failure(minimizeWitness(experiment.oldContract, experiment.newContract, { ...witness, sequence: 2513 }, searchOptions), 'validation_error')
  })

  it('rejects oversized comparison traces before traversing their contents', () => {
    const input = structuredClone(witness)
    const trace = Array.from({ length: 37 }, () => input.comparison.oldEvaluation.trace[0]!)
    Object.defineProperty(trace, 0, { get: () => { throw new Error('Oversized trace contents must not be accessed.') } })
    input.comparison.oldEvaluation.trace = trace
    failure(minimizeWitness(experiment.oldContract, experiment.newContract, input, searchOptions), 'validation_error')
  })
})
