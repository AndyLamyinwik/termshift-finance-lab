import { describe, expect, it } from 'vitest'
import { compareContracts } from '../engine'
import { validateScenario, type Contract, type Scenario } from '../models'
import {
  gracePeriodShiftExperiment,
  microtransactionPenaltyExperiment,
  waiverTrapExperiment,
} from '../scenarios/experiments'
import { searchCounterexamples } from './index'
import { generateCandidateScenario } from './generator'
import type { SearchOptions, SearchReport, SearchResult } from './types'

function contract(rules: Contract['rules']): Contract {
  return {
    schemaVersion: 1,
    id: 'search-contract',
    name: 'Synthetic search test contract',
    version: '1.0.0',
    currency: 'USD',
    billingCycle: 'calendar-month',
    effectiveDate: '2026-06-01',
    rules,
  }
}

function scenario(
  amounts: readonly number[] = [],
  paymentEvents: Scenario['paymentEvents'] = [],
  billingMonth = '2026-05',
): Scenario {
  return {
    schemaVersion: 1,
    id: 'search-base',
    billingMonth,
    transactions: amounts.map((amountCents, index) => ({
      id: `purchase-${index + 1}`,
      occurredOn: `${billingMonth}-01`,
      amountCents,
      kind: 'purchase',
    })),
    paymentEvents,
  }
}

function options(overrides: Partial<SearchOptions> = {}): SearchOptions {
  return {
    seed: 123456,
    maxEvaluations: 120,
    maxResults: 6,
    purchaseCountMin: 0,
    purchaseCountMax: 12,
    purchaseAmountCentsMin: 100,
    purchaseAmountCentsMax: 1500,
    lateDaysMin: 0,
    lateDaysMax: 6,
    ...overrides,
  }
}

function success(result: SearchResult): SearchReport {
  expect(result.success).toBe(true)
  if (!result.success) throw new Error(JSON.stringify(result.issues))
  return result.data
}

function expectFailure(result: SearchResult, code = 'validation_error') {
  expect(result.success).toBe(false)
  expect(result).not.toHaveProperty('data')
  if (result.success) throw new Error('Expected a structured search failure.')
  expect(result.issues.length).toBeGreaterThan(0)
  expect(result.issues.some((issue) => issue.code === code)).toBe(true)
  for (const issue of result.issues) {
    expect(Array.isArray(issue.path)).toBe(true)
    expect(issue.message.length).toBeGreaterThan(0)
  }
}

function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach((child: unknown) => freeze(child))
    Object.freeze(value)
  }
  return value
}

function assertReport(
  report: SearchReport,
  oldContract: Contract,
  newContract: Contract,
  searchOptions: SearchOptions,
) {
  expect(report.seed).toBe(searchOptions.seed)
  expect(report.searchOptions).toEqual(searchOptions)
  expect(report.maxEvaluations).toBe(searchOptions.maxEvaluations)
  expect(report.evaluatedCount).toBeLessThanOrEqual(searchOptions.maxEvaluations)
  expect(report.budgetExhausted).toBe(report.evaluatedCount >= searchOptions.maxEvaluations)
  expect(report.witnesses.length).toBeLessThanOrEqual(searchOptions.maxResults)
  const evaluated = report.candidates.filter((candidate) =>
    candidate.status === 'evaluated' || candidate.status === 'comparison_failed')
  expect(report.evaluatedCount).toBe(evaluated.length)
  expect(report.failedCount).toBe(report.candidates.filter((candidate) =>
    candidate.status === 'comparison_failed').length)
  expect(report.skippedCount).toBe(report.candidates.length - evaluated.length)
  expect(Object.values(report.sourceEvaluations).reduce((sum, count) => sum + count, 0))
    .toBe(report.evaluatedCount)
  expect(new Set(report.candidates.map((candidate) => candidate.candidateId)).size)
    .toBe(report.candidates.length)
  for (const witness of report.witnesses) {
    expect(witness.deltaCents).not.toBe(0)
    expect(validateScenario(witness.scenario).success).toBe(true)
    const comparison = compareContracts(oldContract, newContract, witness.scenario)
    expect(comparison.success).toBe(true)
    if (!comparison.success) throw new Error(JSON.stringify(comparison.issues))
    expect(witness.comparison).toEqual(comparison.data)
    expect(witness.deltaCents).toBe(comparison.data.deltaCents)
    if (witness.source !== 'base') {
      expect(witness.scenario.transactions.every((transaction) =>
        transaction.occurredOn === `${witness.scenario.billingMonth}-01`)).toBe(true)
      expect(new Set(witness.scenario.transactions.map((transaction) => transaction.amountCents)).size)
        .toBeLessThanOrEqual(1)
      expect(witness.scenario.transactions.length).toBeGreaterThanOrEqual(searchOptions.purchaseCountMin)
      expect(witness.scenario.transactions.length).toBeLessThanOrEqual(searchOptions.purchaseCountMax)
      for (const transaction of witness.scenario.transactions) {
        expect(transaction.amountCents).toBeGreaterThanOrEqual(searchOptions.purchaseAmountCentsMin)
        expect(transaction.amountCents).toBeLessThanOrEqual(searchOptions.purchaseAmountCentsMax)
      }
    }
    expect(report.candidates).toContainEqual(expect.objectContaining({
      candidateId: witness.candidateId,
      sequence: witness.sequence,
      source: witness.source,
      status: 'evaluated',
      deltaCents: witness.deltaCents,
    }))
  }
  for (let index = 1; index < report.witnesses.length; index += 1) {
    const previous = report.witnesses[index - 1]!
    const current = report.witnesses[index]!
    expect(Math.abs(previous.deltaCents)).toBeGreaterThanOrEqual(Math.abs(current.deltaCents))
    if (Math.abs(previous.deltaCents) === Math.abs(current.deltaCents)) {
      expect(previous.sequence).toBeLessThan(current.sequence)
    }
  }
  const ranked = report.candidates.filter((candidate) => candidate.status === 'evaluated'
    && candidate.deltaCents !== undefined && candidate.deltaCents !== 0)
    .sort((left, right) => Math.abs(right.deltaCents!) - Math.abs(left.deltaCents!)
      || left.sequence - right.sequence)
  const bestPositive = ranked.find((candidate) => candidate.deltaCents! > 0)
  const bestNegative = ranked.find((candidate) => candidate.deltaCents! < 0)
  const expected = searchOptions.maxResults >= 2 && bestPositive && bestNegative
    ? [bestPositive, bestNegative, ...ranked.filter((candidate) =>
      candidate !== bestPositive && candidate !== bestNegative)].slice(0, searchOptions.maxResults)
    : ranked.slice(0, searchOptions.maxResults)
  expected.sort((left, right) => Math.abs(right.deltaCents!) - Math.abs(left.deltaCents!)
    || left.sequence - right.sequence)
  expect(report.witnesses.map((witness) => witness.candidateId))
    .toEqual(expected.map((candidate) => candidate.candidateId))
}

const zeroContract = contract({ transactionFee: { fixedCents: 0, rateBps: 0 } })
const chargedContract = contract({ transactionFee: { fixedCents: 20, rateBps: 60 } })

describe('search capacity preflight', () => {
  it.each([
    ['transactions', 31],
    ['paymentEvents', 6],
  ] as const)('rejects oversized %s before traversing its elements', (field, length) => {
    const oversized: unknown[] = new Array(length)
    Object.defineProperty(oversized, 0, {
      get() {
        throw new Error('Over-capacity base elements must not be visited')
      },
    })
    const result = searchCounterexamples(zeroContract, chargedContract, {
      ...scenario(), [field]: oversized,
    }, options())
    expectFailure(result, 'capacity_exceeded')
    if (result.success) throw new Error('Expected capacity rejection')
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'capacity_exceeded', path: ['baseScenario', field],
    }))
  })
})

describe('formal fixture counterexample searches', () => {
  it.each([
    { fixture: waiverTrapExperiment, label: 'Waiver Trap' },
    { fixture: microtransactionPenaltyExperiment, label: 'Microtransaction Penalty' },
    { fixture: gracePeriodShiftExperiment, label: 'Grace Period Shift' },
  ])('finds $label witnesses starting from zero difference', ({ fixture }) => {
    const base: Scenario = {
      ...fixture.scenario,
      transactions: [],
      paymentEvents: fixture.scenario.paymentEvents.map((event) => ({ ...event, paidOn: event.dueOn })),
    }
    const initial = compareContracts(fixture.oldContract, fixture.newContract, base)
    expect(initial.success).toBe(true)
    if (!initial.success) throw new Error(JSON.stringify(initial.issues))
    expect(initial.data.deltaCents).toBe(0)
    const searchOptions = options()
    const report = success(searchCounterexamples(fixture.oldContract, fixture.newContract, base, searchOptions))
    expect(report.status).toBe('witnesses-found')
    expect(report.witnesses.length).toBeGreaterThan(0)
    expect(report.candidates[0]).toEqual(expect.objectContaining({
      source: 'base', status: 'evaluated', deltaCents: 0,
    }))
    expect(report.witnesses.some((witness) => witness.source !== 'base')).toBe(true)
    // Reconstruct every generated fixture candidate, including skipped duplicates,
    // rather than validating only the retained witnesses.
    for (const candidate of report.candidates) {
      if (candidate.source === 'base' || !candidate.parameters) continue
      const generated = generateCandidateScenario(base, candidate.parameters, candidate.candidateId)
      expect(generated.success).toBe(true)
      if (!generated.success) throw new Error(JSON.stringify(generated.issues))
      expect(validateScenario(generated.scenario).success).toBe(true)
      if (candidate.status === 'evaluated') {
        const actual = compareContracts(fixture.oldContract, fixture.newContract, generated.scenario)
        expect(actual.success).toBe(true)
        if (!actual.success) throw new Error(JSON.stringify(actual.issues))
        expect(candidate.deltaCents).toBe(actual.data.deltaCents)
      }
    }
    assertReport(report, fixture.oldContract, fixture.newContract, searchOptions)
  })
})

describe('determinism and genuine seeded exploration', () => {
  const broadOptions = options({
    maxEvaluations: 60,
    purchaseCountMax: 30,
    purchaseAmountCentsMin: 1,
    purchaseAmountCentsMax: 100000,
    lateDaysMax: 31,
  })

  it('returns identical complete reports for repeated inputs and seed', () => {
    const first = searchCounterexamples(zeroContract, chargedContract, scenario(), broadOptions)
    const second = searchCounterexamples(zeroContract, chargedContract, scenario(), broadOptions)
    expect(second).toEqual(first)
    const report = success(first)
    expect(report.sourceEvaluations.seeded).toBeGreaterThan(0)
    assertReport(report, zeroContract, chargedContract, broadOptions)
  })

  it('changes the seeded candidate choices when seed changes', () => {
    const first = success(searchCounterexamples(zeroContract, chargedContract, scenario(), broadOptions))
    const second = success(searchCounterexamples(
      zeroContract, chargedContract, scenario(), { ...broadOptions, seed: broadOptions.seed + 1 },
    ))
    const randomChoices = (report: SearchReport) => report.candidates
      .filter((candidate) => candidate.source === 'seeded').map((candidate) => candidate.parameters)
    expect(randomChoices(first).length).toBeGreaterThan(0)
    expect(randomChoices(second).length).toBeGreaterThan(0)
    expect(randomChoices(first)).not.toEqual(randomChoices(second))
  })

  it('keeps deeply frozen contracts, base scenario, and options unchanged', () => {
    const oldInput = freeze(structuredClone(waiverTrapExperiment.oldContract))
    const newInput = freeze(structuredClone(waiverTrapExperiment.newContract))
    const base = freeze(scenario([100, 200], [{
      id: 'original-payment', dueOn: '2026-05-28', paidOn: '2026-05-30', amountCents: 3000,
    }]))
    const searchOptions = freeze(options())
    const before = JSON.stringify({ oldInput, newInput, base, searchOptions })
    const first = searchCounterexamples(oldInput, newInput, base, searchOptions)
    expect(first.success).toBe(true)
    expect(searchCounterexamples(oldInput, newInput, base, searchOptions)).toEqual(first)
    expect(JSON.stringify({ oldInput, newInput, base, searchOptions })).toBe(before)
  })

  it('serializes the public result and can reproduce it from JSON inputs', () => {
    const inputs = {
      oldContract: zeroContract, newContract: chargedContract, base: scenario(), options: broadOptions,
    }
    const result = searchCounterexamples(inputs.oldContract, inputs.newContract, inputs.base, inputs.options)
    expect(JSON.parse(JSON.stringify(result))).toEqual(result)
    const roundTrip = JSON.parse(JSON.stringify(inputs)) as typeof inputs
    expect(searchCounterexamples(roundTrip.oldContract, roundTrip.newContract, roundTrip.base, roundTrip.options))
      .toEqual(result)
  })
})

describe('budget, retention, deduplication, and coverage', () => {
  it.each([1, 2, 17, 500])('respects an evaluation budget of %i', (maxEvaluations) => {
    const searchOptions = options({
      maxEvaluations, purchaseCountMax: 30, purchaseAmountCentsMax: 100000, lateDaysMax: 31,
    })
    const report = success(searchCounterexamples(zeroContract, chargedContract, scenario(), searchOptions))
    assertReport(report, zeroContract, chargedContract, searchOptions)
    expect(report.coverage.complete).toBe(false)
    expect(report.coverage.visitedParameterCount).toBeLessThan(report.coverage.generatedSpaceSize)
  })

  it.each([1, 2, 10])('retains at most %i strongest witnesses', (maxResults) => {
    const searchOptions = options({ maxResults })
    const report = success(searchCounterexamples(zeroContract, chargedContract, scenario(), searchOptions))
    expect(report.witnesses).toHaveLength(maxResults)
    assertReport(report, zeroContract, chargedContract, searchOptions)
  })

  it('retains positive and negative representatives when two slots are available', () => {
    const oldContract = contract({ transactionFee: { fixedCents: 0, rateBps: 1000 } })
    const newContract = contract({ transactionFee: { fixedCents: 80, rateBps: 0 } })
    const searchOptions = options({
      maxResults: 2,
      purchaseCountMin: 1,
      purchaseCountMax: 1,
      purchaseAmountCentsMin: 100,
      purchaseAmountCentsMax: 10000,
    })
    const report = success(searchCounterexamples(oldContract, newContract, scenario([100]), searchOptions))
    expect(report.witnesses).toHaveLength(2)
    expect(report.witnesses.some((witness) => witness.deltaCents > 0)).toBe(true)
    expect(report.witnesses.some((witness) => witness.deltaCents < 0)).toBe(true)
    assertReport(report, oldContract, newContract, searchOptions)
  })

  it('does not manufacture witnesses for identical contracts', () => {
    const searchOptions = options()
    const report = success(searchCounterexamples(chargedContract, chargedContract, scenario(), searchOptions))
    expect(report.status).toBe('no-witness-found')
    expect(report.witnesses).toEqual([])
    expect(report.message).toMatch(/range|範圍/i)
    expect(report.message).toMatch(/budget|預算/i)
    expect(report.message).toMatch(/does not establish contract equivalence/i)
    expect(report.message).not.toMatch(/contracts (?:are|remain) (?:completely )?equivalent/i)
    assertReport(report, chargedContract, chargedContract, searchOptions)
  })

  it('deduplicates a fully visited tiny generated domain and ignores unused dimensions', () => {
    const searchOptions = options({
      maxEvaluations: 30,
      purchaseCountMax: 1,
      purchaseAmountCentsMin: 100,
      purchaseAmountCentsMax: 101,
      lateDaysMax: 31,
    })
    const report = success(searchCounterexamples(zeroContract, chargedContract, scenario(), searchOptions))
    // Count zero has no amount dimension; no payment events have no delay dimension.
    expect(report.coverage.generatedSpaceSize).toBe(3)
    expect(report.coverage.visitedParameterCount).toBe(3)
    expect(report.coverage.complete).toBe(true)
    expect(report.stopReason).toBe('space-covered')
    expect(report.evaluatedCount).toBe(3)
    expect(report.budgetExhausted).toBe(false)
    const duplicates = report.candidates.filter((candidate) => candidate.status === 'duplicate')
    expect(duplicates.length).toBeGreaterThan(0)
    for (const duplicate of duplicates) {
      expect(report.candidates.some((candidate) => candidate.candidateId === duplicate.duplicateOf
        && (candidate.status === 'evaluated' || candidate.status === 'comparison_failed'))).toBe(true)
    }
    expect(report.candidates.some((candidate) => candidate.source === 'seeded')).toBe(true)
    assertReport(report, zeroContract, chargedContract, searchOptions)
  })

  it('does not spend repeated evaluations on count zero with a huge amount range', () => {
    const searchOptions = options({ purchaseCountMax: 0, purchaseAmountCentsMax: 100000, lateDaysMax: 31 })
    const report = success(searchCounterexamples(zeroContract, chargedContract, scenario(), searchOptions))
    expect(report.coverage.generatedSpaceSize).toBe(1)
    expect(report.coverage.complete).toBe(true)
    expect(report.evaluatedCount).toBe(1)
    expect(report.witnesses).toEqual([])
    assertReport(report, zeroContract, chargedContract, searchOptions)
  })

  it('bounds attempts even when duplicate generation cannot spend the requested budget', () => {
    const searchOptions = options({
      maxEvaluations: 500, purchaseCountMax: 1, purchaseAmountCentsMax: 102, purchaseAmountCentsMin: 100,
    })
    const report = success(searchCounterexamples(zeroContract, chargedContract, scenario(), searchOptions))
    expect(report.candidates.filter((candidate) => candidate.source === 'seeded').length)
      .toBeLessThanOrEqual(searchOptions.maxEvaluations * 4)
    expect(report.evaluatedCount).toBeLessThanOrEqual(4)
    expect(['space-covered', 'attempt-limit']).toContain(report.stopReason)
    assertReport(report, zeroContract, chargedContract, searchOptions)
  })
})

describe('derived boundaries and user search ranges', () => {
  it('derives a changed transaction-count waiver threshold from the actual contracts', () => {
    const oldContract = contract({
      monthlyFee: { feeCents: 1200, waiver: { kind: 'minTransactionCount', threshold: 7 } },
    })
    const newContract = contract({
      monthlyFee: { feeCents: 1200, waiver: { kind: 'minTransactionCount', threshold: 13 } },
    })
    const searchOptions = options({ purchaseCountMax: 16, maxEvaluations: 70 })
    const report = success(searchCounterexamples(oldContract, newContract, scenario(), searchOptions))
    const boundaryCounts = report.candidates.filter((candidate) => candidate.source === 'boundary')
      .map((candidate) => candidate.parameters?.purchaseCount)
    expect(boundaryCounts).toContain(7)
    expect(boundaryCounts).toContain(13)
    expect(report.witnesses.some((witness) => witness.scenario.transactions.length >= 7
      && witness.scenario.transactions.length < 13)).toBe(true)
    assertReport(report, oldContract, newContract, searchOptions)
  })

  it('never broadens ranges to reach a rule threshold outside the requested domain', () => {
    const oldContract = contract({
      monthlyFee: { feeCents: 1200, waiver: { kind: 'minTransactionCount', threshold: 7 } },
    })
    const newContract = contract({
      monthlyFee: { feeCents: 1200, waiver: { kind: 'minTransactionCount', threshold: 13 } },
    })
    const searchOptions = options({
      purchaseCountMin: 1, purchaseCountMax: 3,
      purchaseAmountCentsMin: 111, purchaseAmountCentsMax: 113,
      lateDaysMin: 2, lateDaysMax: 4,
    })
    const report = success(searchCounterexamples(oldContract, newContract, scenario([111]), searchOptions))
    const evaluated = report.candidates.filter((candidate) => candidate.status === 'evaluated')
    for (const candidate of evaluated) {
      if (!candidate.parameters) continue
      expect(candidate.parameters.purchaseCount).toBeGreaterThanOrEqual(1)
      expect(candidate.parameters.purchaseCount).toBeLessThanOrEqual(3)
      expect(candidate.parameters.purchaseAmountCents).toBeGreaterThanOrEqual(111)
      expect(candidate.parameters.purchaseAmountCents).toBeLessThanOrEqual(113)
    }
    expect(report.witnesses).toEqual([])
    assertReport(report, oldContract, newContract, searchOptions)
  })

  it('records and skips a valid base outside options instead of rejecting it or expanding the domain', () => {
    const searchOptions = options({ purchaseCountMin: 2, purchaseCountMax: 3 })
    const report = success(searchCounterexamples(zeroContract, chargedContract, scenario(), searchOptions))
    expect(report.candidates[0]).toEqual(expect.objectContaining({ source: 'base', status: 'out_of_range' }))
    expect(report.sourceEvaluations.base).toBe(0)
    expect(report.witnesses.length).toBeGreaterThan(0)
    expect(report.witnesses.every((witness) => witness.scenario.transactions.length >= 2
      && witness.scenario.transactions.length <= 3)).toBe(true)
    assertReport(report, zeroContract, chargedContract, searchOptions)
  })
})

describe('safe unknown input and option validation', () => {
  it.each([
    ['seed', -1], ['seed', 4294967296], ['seed', 0.5], ['seed', NaN], ['seed', Infinity],
    ['maxEvaluations', 0], ['maxEvaluations', 501], ['maxEvaluations', 1.5],
    ['maxResults', 0], ['maxResults', 11], ['maxResults', Infinity],
    ['purchaseCountMin', -1], ['purchaseCountMax', 31], ['purchaseCountMax', 2.5],
    ['purchaseAmountCentsMin', 0], ['purchaseAmountCentsMax', 100001], ['purchaseAmountCentsMax', NaN],
    ['lateDaysMin', -1], ['lateDaysMax', 32], ['lateDaysMax', 0.5],
  ] as const)('rejects %s = %s', (key, value) => {
    expectFailure(searchCounterexamples(zeroContract, chargedContract, scenario(), { ...options(), [key]: value }))
  })

  it.each([
    { purchaseCountMin: 4, purchaseCountMax: 3 },
    { purchaseAmountCentsMin: 200, purchaseAmountCentsMax: 100 },
    { lateDaysMin: 3, lateDaysMax: 2 },
  ])('rejects reversed inclusive limits: %j', (overrides) => {
    expectFailure(searchCounterexamples(zeroContract, chargedContract, scenario(), options(overrides)))
  })

  it.each([null, undefined, [], 'options', {}, { ...options(), extra: true }])('rejects non-options or unknown fields: %j', (input) => {
    expectFailure(searchCounterexamples(zeroContract, chargedContract, scenario(), input))
  })

  it('requires every documented option rather than silently using defaults', () => {
    for (const key of Object.keys(options()) as (keyof SearchOptions)[]) {
      const input: Partial<SearchOptions> = options()
      delete input[key]
      expectFailure(searchCounterexamples(zeroContract, chargedContract, scenario(), input))
    }
  })

  it.each([
    ['oldContract', { ...zeroContract, currency: 'EUR' }],
    ['newContract', { ...chargedContract, rules: { unknownFee: {} } }],
    ['baseScenario', { ...scenario(), billingMonth: '2026-13' }],
  ])('uses official runtime validation for invalid %s', (target, input) => {
    expectFailure(searchCounterexamples(
      target === 'oldContract' ? input : zeroContract,
      target === 'newContract' ? input : chargedContract,
      target === 'baseScenario' ? input : scenario(),
      options(),
    ))
  })

  it.each([0, 4294967295])('accepts seed endpoint %i', (seed) => {
    const searchOptions = options({ seed, maxEvaluations: 1 })
    assertReport(success(searchCounterexamples(zeroContract, chargedContract, scenario(), searchOptions)),
      zeroContract, chargedContract, searchOptions)
  })

  it('rejects more than 30 existing transactions without truncating or mutating input', () => {
    const base = scenario(Array<number>(31).fill(100))
    expect(validateScenario(base).success).toBe(true)
    const before = JSON.stringify(base)
    expectFailure(searchCounterexamples(zeroContract, chargedContract, base, options()), 'capacity_exceeded')
    expect(JSON.stringify(base)).toBe(before)
  })

  it('rejects more than five existing payments without deleting obligations', () => {
    const base = scenario([], Array.from({ length: 6 }, (_, index) => ({
      id: `payment-${index + 1}`, dueOn: '2026-05-15', paidOn: '2026-05-15', amountCents: 100,
    })))
    expect(validateScenario(base).success).toBe(true)
    const before = JSON.stringify(base)
    expectFailure(searchCounterexamples(zeroContract, chargedContract, base, options()), 'capacity_exceeded')
    expect(JSON.stringify(base)).toBe(before)
  })

  it('accepts exactly 30 purchases and five payment events at the capacity limit', () => {
    const base = scenario(Array<number>(30).fill(100), Array.from({ length: 5 }, (_, index) => ({
      id: `payment-${index + 1}`, dueOn: '2026-05-15', paidOn: '2026-05-15', amountCents: 100,
    })))
    const searchOptions = options({ purchaseCountMax: 30, maxEvaluations: 1 })
    const report = success(searchCounterexamples(zeroContract, chargedContract, base, searchOptions))
    expect(report.candidates[0]?.status).toBe('evaluated')
    assertReport(report, zeroContract, chargedContract, searchOptions)
  })
})

describe('Gregorian payment generation and calculation failures', () => {
  it.each([
    { dueOn: '2024-02-28', paidOn: '2024-02-29', month: '2024-02' },
    { dueOn: '2023-12-31', paidOn: '2024-01-01', month: '2023-12' },
    { dueOn: '1900-02-28', paidOn: '1900-03-01', month: '1900-02' },
    { dueOn: '2000-02-28', paidOn: '2000-02-29', month: '2000-02' },
  ])('generates a one-day delay from $dueOn to $paidOn', ({ dueOn, paidOn, month }) => {
    const oldContract = contract({ lateFee: { feeCents: 0, graceDays: 0 } })
    const newContract = contract({ lateFee: { feeCents: 100, graceDays: 0 } })
    const base = scenario([], [{ id: 'calendar-payment', dueOn, paidOn: dueOn, amountCents: 1234 }], month)
    const searchOptions = options({ purchaseCountMax: 0, lateDaysMin: 1, lateDaysMax: 1 })
    const report = success(searchCounterexamples(oldContract, newContract, base, searchOptions))
    expect(report.witnesses.length).toBeGreaterThan(0)
    for (const witness of report.witnesses) {
      expect(witness.scenario.paymentEvents).toEqual([{ id: 'calendar-payment', dueOn, paidOn, amountCents: 1234 }])
      expect(witness.scenario.billingMonth).toBe(month)
    }
    assertReport(report, oldContract, newContract, searchOptions)
  })

  it('uses one shared delay while preserving every existing payment obligation', () => {
    const oldContract = contract({ lateFee: { feeCents: 0, graceDays: 0 } })
    const newContract = contract({ lateFee: { feeCents: 100, graceDays: 0 } })
    const payments = [
      { id: 'first-payment', dueOn: '2026-05-31', paidOn: '2026-05-31', amountCents: 100 },
      { id: 'second-payment', dueOn: '2026-12-31', paidOn: '2026-12-31', amountCents: 200 },
    ]
    const searchOptions = options({ purchaseCountMax: 0, lateDaysMin: 2, lateDaysMax: 2 })
    const report = success(searchCounterexamples(oldContract, newContract, scenario([], payments), searchOptions))
    expect(report.witnesses[0]?.scenario.paymentEvents).toEqual([
      { ...payments[0], paidOn: '2026-06-02' },
      { ...payments[1], paidOn: '2027-01-02' },
    ])
    assertReport(report, oldContract, newContract, searchOptions)
  })

  it('does not invent payment events even when late-fee contracts differ', () => {
    const oldContract = contract({ lateFee: { feeCents: 0, graceDays: 0 } })
    const newContract = contract({ lateFee: { feeCents: 100, graceDays: 0 } })
    const searchOptions = options()
    const report = success(searchCounterexamples(oldContract, newContract, scenario(), searchOptions))
    expect(report.witnesses).toEqual([])
    assertReport(report, oldContract, newContract, searchOptions)
  })

  it('records generated dates past year 9999 as invalid candidates instead of charging fake fees', () => {
    const oldContract = contract({ lateFee: { feeCents: 0, graceDays: 0 } })
    const newContract = contract({ lateFee: { feeCents: 100, graceDays: 0 } })
    const base = scenario([], [{
      id: 'last-payment', dueOn: '9999-12-31', paidOn: '9999-12-31', amountCents: 100,
    }], '9999-12')
    const searchOptions = options({ purchaseCountMax: 0, lateDaysMin: 1, lateDaysMax: 2 })
    const report = success(searchCounterexamples(oldContract, newContract, base, searchOptions))
    expect(report.witnesses).toEqual([])
    expect(report.evaluatedCount).toBe(0)
    expect(report.candidates.some((candidate) => candidate.status === 'invalid_scenario'
      && candidate.issues?.some((issue) => issue.code === 'candidate_date_out_of_range'))).toBe(true)
    expect(report.failedCount).toBe(0)
    assertReport(report, oldContract, newContract, searchOptions)
  })

  it('counts traceable comparison overflows as failures, never zero difference or witnesses', () => {
    const oldContract = zeroContract
    const newContract = contract({ transactionFee: { fixedCents: Number.MAX_SAFE_INTEGER, rateBps: 0 } })
    const searchOptions = options({
      purchaseCountMin: 2, purchaseCountMax: 3,
      purchaseAmountCentsMin: 100, purchaseAmountCentsMax: 101,
    })
    const report = success(searchCounterexamples(oldContract, newContract, scenario([100, 100]), searchOptions))
    expect(report.witnesses).toEqual([])
    expect(report.failedCount).toBeGreaterThan(0)
    const failures = report.candidates.filter((candidate) => candidate.status === 'comparison_failed')
    expect(failures).toHaveLength(report.evaluatedCount)
    for (const failure of failures) {
      expect(failure).not.toHaveProperty('deltaCents')
      expect(failure.issues?.some((issue) => issue.code === 'overflow')).toBe(true)
    }
    assertReport(report, oldContract, newContract, searchOptions)
  })
})
