import { describe, expect, it } from 'vitest'
import { compareContracts } from '../../engine'
import type { EngineResult } from '../../engine'
import { validateScenario } from '../../models'
import { experiments, gracePeriodShiftExperiment } from '../../scenarios'
import { validateSearchOptions } from '../../search'
import type { DraftResult } from '../financial-diff/drafts'
import {
  createSearchBase,
  createSearchOptionsDraft,
  DEFAULT_SEARCH_OPTIONS,
  parseSearchOptionsDraft,
} from './options'
import type { SearchOptionsDraft } from './options'

function unwrap<T>(result: DraftResult<T> | EngineResult<T>): T {
  expect(result.success).toBe(true)
  if (!result.success) throw new Error(JSON.stringify(result.issues))
  return result.data
}

function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freezeDeep(child)
    Object.freeze(value)
  }
  return value
}

describe('Counterexample Hunter search option drafts', () => {
  it('exposes formally validated, immutable numeric defaults and independent text copies', () => {
    expect(DEFAULT_SEARCH_OPTIONS).toEqual({
      seed: 20260401,
      maxEvaluations: 120,
      maxResults: 5,
      purchaseCountMin: 0,
      purchaseCountMax: 10,
      purchaseAmountCentsMin: 100,
      purchaseAmountCentsMax: 1000,
      lateDaysMin: 0,
      lateDaysMax: 5,
    })
    expect(Object.isFrozen(DEFAULT_SEARCH_OPTIONS)).toBe(true)
    expect(validateSearchOptions(DEFAULT_SEARCH_OPTIONS).success).toBe(true)
    const first = createSearchOptionsDraft()
    const second = createSearchOptionsDraft()
    expect(first).not.toBe(second)
    expect(first).toEqual({
      seed: '20260401', maxEvaluations: '120', maxResults: '5',
      purchaseCountMin: '0', purchaseCountMax: '10',
      purchaseAmountUsdMin: '1.00', purchaseAmountUsdMax: '10.00',
      lateDaysMin: '0', lateDaysMax: '5',
    })
    first.seed = '7'
    expect(second.seed).toBe('20260401')
    expect(DEFAULT_SEARCH_OPTIONS.seed).toBe(20260401)
    expect(unwrap(parseSearchOptionsDraft(second))).toEqual(DEFAULT_SEARCH_OPTIONS)
  })

  it('accepts the smallest and largest permitted ranges without clamping', () => {
    const minimum = unwrap(parseSearchOptionsDraft({
      seed: '0', maxEvaluations: '1', maxResults: '1',
      purchaseCountMin: '0', purchaseCountMax: '0',
      purchaseAmountUsdMin: '0.01', purchaseAmountUsdMax: '0.01',
      lateDaysMin: '0', lateDaysMax: '0',
    }))
    expect(minimum).toEqual({
      seed: 0, maxEvaluations: 1, maxResults: 1,
      purchaseCountMin: 0, purchaseCountMax: 0,
      purchaseAmountCentsMin: 1, purchaseAmountCentsMax: 1,
      lateDaysMin: 0, lateDaysMax: 0,
    })
    const maximum = unwrap(parseSearchOptionsDraft({
      seed: '4294967295', maxEvaluations: '500', maxResults: '10',
      purchaseCountMin: '30', purchaseCountMax: '30',
      purchaseAmountUsdMin: '1000.00', purchaseAmountUsdMax: '1000.00',
      lateDaysMin: '31', lateDaysMax: '31',
    }))
    expect(maximum).toEqual({
      seed: 4294967295, maxEvaluations: 500, maxResults: 10,
      purchaseCountMin: 30, purchaseCountMax: 30,
      purchaseAmountCentsMin: 100000, purchaseAmountCentsMax: 100000,
      lateDaysMin: 31, lateDaysMax: 31,
    })
  })

  it('uses exact integer cents for USD text instead of floating multiplication', () => {
    const options = unwrap(parseSearchOptionsDraft({
      ...createSearchOptionsDraft(),
      purchaseAmountUsdMin: '0.29',
      purchaseAmountUsdMax: '1.01',
    }))
    expect(options.purchaseAmountCentsMin).toBe(29)
    expect(options.purchaseAmountCentsMax).toBe(101)
    expect(Number.isSafeInteger(options.purchaseAmountCentsMin)).toBe(true)
  })

  it.each([
    '', ' ', ' 1', '1 ', '1\n', '-1', '+1', '01', '1.0', '1.5',
    '1e2', '0x10', 'NaN', 'Infinity', '1,000', '9007199254740992',
  ])('rejects non-canonical seed text %j with an exact field error', (value) => {
    expect(parseSearchOptionsDraft({ ...createSearchOptionsDraft(), seed: value }))
      .toMatchObject({ success: false, issues: [{ path: ['seed'] }] })
  })

  it.each([
    '', ' ', ' 1.00', '1.00 ', '1.00\n', '-1', '+1', '01.00', '.50',
    '1.', '1.001', '1e2', '0x10', 'NaN', 'Infinity', '1,000', '90071992547409.92',
  ])('rejects malformed USD text %j rather than expanding or truncating the range', (value) => {
    expect(parseSearchOptionsDraft({ ...createSearchOptionsDraft(), purchaseAmountUsdMin: value }))
      .toMatchObject({ success: false, issues: [{ path: ['purchaseAmountUsdMin'] }] })
  })

  it.each<[keyof SearchOptionsDraft, string]>([
    ['seed', '4294967296'],
    ['maxEvaluations', '0'], ['maxEvaluations', '501'],
    ['maxResults', '0'], ['maxResults', '11'],
    ['purchaseCountMin', '31'], ['purchaseCountMax', '31'],
    ['purchaseAmountUsdMin', '0'], ['purchaseAmountUsdMax', '0'],
    ['purchaseAmountUsdMin', '1000.01'], ['purchaseAmountUsdMax', '1000.01'],
    ['lateDaysMin', '32'], ['lateDaysMax', '32'],
  ])('rejects out-of-range %s=%s at its editor field path', (field, value) => {
    const result = parseSearchOptionsDraft({ ...createSearchOptionsDraft(), [field]: value })
    expect(result.success).toBe(false)
    if (result.success) throw new Error('Expected a bounded field error')
    expect(result.issues.some((issue) => issue.path[0] === field)).toBe(true)
    expect(result.issues.every((issue) => issue.message.length > 0)).toBe(true)
  })

  it.each<[keyof SearchOptionsDraft, keyof SearchOptionsDraft, string, string]>([
    ['purchaseCountMin', 'purchaseCountMax', '3', '2'],
    ['purchaseAmountUsdMin', 'purchaseAmountUsdMax', '1.02', '1.01'],
    ['lateDaysMin', 'lateDaysMax', '3', '2'],
  ])('uses official validation to reject %s greater than %s', (min, max, minValue, maxValue) => {
    expect(parseSearchOptionsDraft({
      ...createSearchOptionsDraft(), [min]: minValue, [max]: maxValue,
    })).toMatchObject({ success: false, issues: [{ code: 'validation_error', path: [max] }] })
  })

  it('collects independent field errors in deterministic order', () => {
    const result = parseSearchOptionsDraft({
      seed: '-1', maxEvaluations: '501', maxResults: '0',
      purchaseCountMin: '1.5', purchaseCountMax: '31',
      purchaseAmountUsdMin: '0.001', purchaseAmountUsdMax: 'Infinity',
      lateDaysMin: '32', lateDaysMax: '',
    })
    expect(result.success).toBe(false)
    if (result.success) throw new Error('Expected field errors')
    expect(result.issues.map((issue) => issue.path[0])).toEqual(Object.keys(createSearchOptionsDraft()))
  })

  it.each(Object.keys(createSearchOptionsDraft()) as (keyof SearchOptionsDraft)[])(
    'rejects a missing or numeric %s field without coercion', (field) => {
      const missing: Partial<SearchOptionsDraft> = createSearchOptionsDraft()
      delete missing[field]
      expect(parseSearchOptionsDraft(missing)).toMatchObject({ success: false, issues: [{ path: [field] }] })
      expect(parseSearchOptionsDraft({ ...createSearchOptionsDraft(), [field]: 1 }))
        .toMatchObject({ success: false, issues: [{ path: [field] }] })
    },
  )

  it('rejects unknown fields and arbitrary unknown root values safely', () => {
    expect(parseSearchOptionsDraft({ ...createSearchOptionsDraft(), extra: true }))
      .toMatchObject({ success: false, issues: [{ code: 'unrecognized_keys', path: [] }] })
    for (const input of [null, undefined, [], '', 1, NaN, Infinity]) {
      expect(parseSearchOptionsDraft(input).success).toBe(false)
    }
  })

  it('is deterministic and JSON-round-trippable without mutating frozen text inputs', () => {
    const draft = freezeDeep(createSearchOptionsDraft())
    const before = JSON.stringify(draft)
    expect(parseSearchOptionsDraft(draft)).toEqual(parseSearchOptionsDraft(draft))
    expect(parseSearchOptionsDraft(JSON.parse(before) as unknown)).toEqual(parseSearchOptionsDraft(draft))
    expect(validateSearchOptions(JSON.parse(JSON.stringify(unwrap(parseSearchOptionsDraft(draft)))) as unknown).success).toBe(true)
    expect(JSON.stringify(draft)).toBe(before)
    const invalid = freezeDeep({ ...draft, purchaseAmountUsdMax: '0.01' })
    expect(parseSearchOptionsDraft(invalid)).toEqual(parseSearchOptionsDraft(invalid))
  })
})

describe('neutral Search Starting Scenario', () => {
  it.each(experiments)('builds a formally valid, independent and neutral starting scenario for $name', (experiment) => {
    const original = freezeDeep(structuredClone(experiment.scenario))
    const before = JSON.stringify(original)
    const base = unwrap(createSearchBase(original))
    expect(base).not.toBe(original)
    expect(base.id).toBe(original.id)
    expect(base.billingMonth).toBe(original.billingMonth)
    expect(base.transactions).toEqual([])
    expect(base.transactions).not.toBe(original.transactions)
    expect(base.paymentEvents).not.toBe(original.paymentEvents)
    expect(base.paymentEvents).toEqual(original.paymentEvents.map((payment) => ({ ...payment, paidOn: payment.dueOn })))
    for (const [index, payment] of base.paymentEvents.entries()) {
      expect(payment).not.toBe(original.paymentEvents[index])
    }
    expect(validateScenario(base).success).toBe(true)
    expect(unwrap(compareContracts(experiment.oldContract, experiment.newContract, base)).deltaCents).toBe(0)
    expect(JSON.stringify(original)).toBe(before)
  })

  it('preserves every original payment obligation, including early and cross-month completed payments', () => {
    const scenario = {
      ...gracePeriodShiftExperiment.scenario,
      paymentEvents: [
        { id: 'early-payment', dueOn: '2026-05-01', paidOn: '2026-04-29', amountCents: 29 },
        { id: 'cross-month-payment', dueOn: '2026-05-31', paidOn: '2026-06-04', amountCents: 10001 },
        { id: 'leap-payment', dueOn: '2024-02-29', paidOn: '2024-03-02', amountCents: 1 },
      ],
    }
    const base = unwrap(createSearchBase(scenario))
    expect(base.paymentEvents).toEqual([
      { id: 'early-payment', dueOn: '2026-05-01', paidOn: '2026-05-01', amountCents: 29 },
      { id: 'cross-month-payment', dueOn: '2026-05-31', paidOn: '2026-05-31', amountCents: 10001 },
      { id: 'leap-payment', dueOn: '2024-02-29', paidOn: '2024-02-29', amountCents: 1 },
    ])
  })

  it('keeps separate base calls independent from one another and the fixture', () => {
    const original = freezeDeep(structuredClone(gracePeriodShiftExperiment.scenario))
    const first = unwrap(createSearchBase(original))
    const second = unwrap(createSearchBase(original))
    const payment = first.paymentEvents[0]
    if (!payment) throw new Error('Fixture must contain a payment obligation')
    payment.amountCents = 1
    payment.paidOn = '2026-05-20'
    first.transactions.push({ id: 'local-change', occurredOn: '2026-05-01', amountCents: 1, kind: 'purchase' })
    expect(second.paymentEvents[0]?.amountCents).toBe(10000)
    expect(second.paymentEvents[0]?.paidOn).toBe('2026-05-15')
    expect(second.transactions).toEqual([])
    expect(original.paymentEvents[0]?.paidOn).toBe('2026-05-17')
    expect(original.paymentEvents[0]?.amountCents).toBe(10000)
  })

  it('rejects invalid original dates before neutralization could hide them', () => {
    const original = gracePeriodShiftExperiment.scenario
    for (const key of ['dueOn', 'paidOn'] as const) {
      const result = createSearchBase({
        ...original,
        paymentEvents: original.paymentEvents.map((payment) => ({ ...payment, [key]: '2026-02-30' })),
      })
      expect(result).toMatchObject({
        success: false,
        issues: [{ code: 'validation_error', path: ['baseScenario', 'paymentEvents', 0, key] }],
      })
    }
  })

  it('validates original purchases before replacing them with an empty array', () => {
    expect(createSearchBase({
      ...experiments[0].scenario,
      transactions: [{ id: 'invalid-purchase', occurredOn: '2026-04-01', amountCents: 1, kind: 'purchase' }],
    })).toMatchObject({
      success: false,
      issues: [{ code: 'validation_error', path: ['baseScenario', 'transactions', 0, 'occurredOn'] }],
    })
  })

  it('rejects unknown fields, missing schema data and duplicate payment IDs with structured issues', () => {
    const original = gracePeriodShiftExperiment.scenario
    const payment = original.paymentEvents[0]
    if (!payment) throw new Error('Fixture must contain a payment obligation')
    for (const input of [
      null, undefined, {}, [],
      { ...original, schemaVersion: 2 },
      { ...original, billingMonth: '2026-13' },
      { ...original, extra: 'unknown-field' },
      { ...original, paymentEvents: [payment, { ...payment }] },
    ]) {
      const result = createSearchBase(input)
      expect(result.success).toBe(false)
      if (result.success) throw new Error('Expected a formal scenario error')
      expect(result.issues.every((issue) => issue.code === 'validation_error' && issue.path[0] === 'baseScenario')).toBe(true)
      expect(result.issues.every((issue) => Boolean(issue.validationCode) && issue.message.length > 0)).toBe(true)
    }
  })

  it('produces identical results and validates JSON serialization without hidden state', () => {
    const input = freezeDeep(structuredClone(gracePeriodShiftExperiment.scenario))
    const first = createSearchBase(input)
    expect(first).toEqual(createSearchBase(input))
    expect(createSearchBase(JSON.parse(JSON.stringify(input)) as unknown)).toEqual(first)
    expect(validateScenario(JSON.parse(JSON.stringify(unwrap(first))) as unknown).success).toBe(true)
  })
})
