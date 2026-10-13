import { describe, expect, it } from 'vitest'
import { validateScenario } from '../models'
import type { Scenario } from '../models'
import { gracePeriodShiftExperiment } from '../scenarios/experiments'
import { createSeededPrng, generateCandidateScenario, seededParameters } from './generator'
import type { CandidateParameters, SearchOptions } from './types'

const base: Scenario = structuredClone(gracePeriodShiftExperiment.scenario)
const parameters: CandidateParameters = { purchaseCount: 3, purchaseAmountCents: 127, lateDays: 2 }
const options: SearchOptions = {
  seed: 0,
  maxEvaluations: 50,
  maxResults: 5,
  purchaseCountMin: 0,
  purchaseCountMax: 30,
  purchaseAmountCentsMin: 1,
  purchaseAmountCentsMax: 100000,
  lateDaysMin: 0,
  lateDaysMax: 31,
}

function scenarioFrom(dueOn: string): Scenario {
  return {
    ...base,
    billingMonth: dueOn.slice(0, 7),
    transactions: [],
    paymentEvents: [{ id: 'date-payment', dueOn, paidOn: dueOn, amountCents: 100 }],
  }
}

function generate(input = base, settings = parameters, id = 'test-candidate'): Scenario {
  const result = generateCandidateScenario(input, settings, id)
  if (!result.success) throw new Error(JSON.stringify(result.issues))
  return result.scenario
}

describe('seeded 32-bit exploration sampler', () => {
  it('has fixed reference outputs for seed zero', () => {
    const prng = createSeededPrng(0)
    expect([prng.nextUint32(), prng.nextUint32(), prng.nextUint32()])
      .toEqual([1013904223, 1196435762, 3519870697])
  })

  it('repeats a sequence for the same maximum valid seed', () => {
    const first = createSeededPrng(4294967295)
    const second = createSeededPrng(4294967295)
    expect(Array.from({ length: 100 }, () => first.nextUint32()))
      .toEqual(Array.from({ length: 100 }, () => second.nextUint32()))
  })

  it('maintains independent state for separate sampler instances', () => {
    const first = createSeededPrng(17)
    const second = createSeededPrng(17)
    const firstValue = first.nextUint32()
    first.nextUint32()
    first.nextUint32()
    expect(second.nextUint32()).toBe(firstValue)
  })

  it('uses both endpoints of an inclusive integer range', () => {
    const prng = createSeededPrng(0)
    expect(new Set(Array.from({ length: 10 }, () => prng.nextInt(7, 8))))
      .toEqual(new Set([7, 8]))
    expect(prng.nextInt(19, 19)).toBe(19)
  })

  it('samples the full unsigned 32-bit range without signed conversion', () => {
    const prng = createSeededPrng(0)
    const values = Array.from({ length: 100 }, () => prng.nextInt(0, 4294967295))
    expect(values.every((value) => value >= 0 && value <= 4294967295 && Number.isInteger(value))).toBe(true)
    expect(values.some((value) => value > 2147483647)).toBe(true)
  })

  it.each([-1, 4294967296, 0.5, NaN, Infinity])('rejects invalid seed %s', (seed) => {
    expect(() => createSeededPrng(seed)).toThrow(RangeError)
  })

  it.each([
    [2, 1],
    [0, Infinity],
    [0, 0.5],
    [0, 4294967296],
    [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1],
  ])('rejects invalid sampler interval [%s, %s]', (min, max) => {
    expect(() => createSeededPrng(0).nextInt(min, max)).toThrow(RangeError)
  })

  it('generates reproducible parameter sequences and changes them with the seed', () => {
    const sample = (seed: number) => {
      const prng = createSeededPrng(seed)
      return Array.from({ length: 20 }, () => seededParameters(prng, options))
    }
    expect(sample(17)).toEqual(sample(17))
    expect(sample(17)).not.toEqual(sample(29))
    for (const candidate of sample(17)) {
      expect(candidate.purchaseCount).toBeGreaterThanOrEqual(0)
      expect(candidate.purchaseCount).toBeLessThanOrEqual(30)
      expect(candidate.purchaseAmountCents).toBeGreaterThanOrEqual(1)
      expect(candidate.purchaseAmountCents).toBeLessThanOrEqual(100000)
      expect(candidate.lateDays).toBeGreaterThanOrEqual(0)
      expect(candidate.lateDays).toBeLessThanOrEqual(31)
    }
  })

  it('handles three singleton ranges exactly', () => {
    const candidate = seededParameters(createSeededPrng(17), {
      ...options,
      purchaseCountMin: 30,
      purchaseCountMax: 30,
      purchaseAmountCentsMin: 100000,
      purchaseAmountCentsMax: 100000,
      lateDaysMin: 31,
      lateDaysMax: 31,
    })
    expect(candidate).toEqual({ purchaseCount: 30, purchaseAmountCents: 100000, lateDays: 31 })
  })
})

describe('bounded Scenario generation', () => {
  it('creates uniform purchases with unique IDs and dates in the billing month', () => {
    const scenario = generate(base, { ...parameters, purchaseCount: 30, purchaseAmountCents: 100000 })
    expect(scenario.id).toBe('test-candidate')
    expect(scenario.transactions).toHaveLength(30)
    expect(new Set(scenario.transactions.map((transaction) => transaction.id)).size).toBe(30)
    expect(scenario.transactions.every((transaction) => transaction.amountCents === 100000
      && transaction.kind === 'purchase' && transaction.occurredOn === '2026-05-01')).toBe(true)
    expect(validateScenario(scenario).success).toBe(true)
  })

  it('accepts zero generated purchases', () => {
    expect(generate(base, { ...parameters, purchaseCount: 0 }).transactions).toEqual([])
  })

  it('preserves existing payment IDs, amounts and due dates while sharing a delay', () => {
    const input: Scenario = {
      ...base,
      paymentEvents: [
        { id: 'first-payment', dueOn: '2024-02-28', paidOn: '2024-03-09', amountCents: 101 },
        { id: 'second-payment', dueOn: '2026-12-31', paidOn: '2026-12-30', amountCents: 202 },
      ],
    }
    expect(generate(input).paymentEvents).toEqual([
      { id: 'first-payment', dueOn: '2024-02-28', paidOn: '2024-03-01', amountCents: 101 },
      { id: 'second-payment', dueOn: '2026-12-31', paidOn: '2027-01-02', amountCents: 202 },
    ])
  })

  it('sets zero delay to dueOn rather than the base paidOn', () => {
    const generated = generate(base, { ...parameters, lateDays: 0 })
    expect(generated.paymentEvents[0]?.paidOn).toBe('2026-05-15')
  })

  it('never creates a payment obligation when the base has none', () => {
    const generated = generate({ ...base, paymentEvents: [] }, { ...parameters, lateDays: 31 })
    expect(generated.paymentEvents).toEqual([])
    expect(validateScenario(generated).success).toBe(true)
  })

  it.each([
    ['0001-12-31', 1, '0002-01-01'],
    ['2024-02-28', 1, '2024-02-29'],
    ['2024-02-28', 2, '2024-03-01'],
    ['2026-02-28', 1, '2026-03-01'],
    ['1900-02-28', 1, '1900-03-01'],
    ['2000-02-28', 1, '2000-02-29'],
    ['2100-02-28', 1, '2100-03-01'],
    ['2400-02-28', 1, '2400-02-29'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2026-01-31', 31, '2026-03-03'],
    ['9999-12-30', 1, '9999-12-31'],
    ['9999-12-31', 0, '9999-12-31'],
  ] as const)('adds %s plus %s calendar days as %s', (dueOn, lateDays, paidOn) => {
    const generated = generate(scenarioFrom(dueOn), { ...parameters, lateDays })
    expect(generated.paymentEvents[0]?.paidOn).toBe(paidOn)
    expect(validateScenario(generated).success).toBe(true)
  })

  it('refuses a date beyond year 9999 with an indexed structured error', () => {
    const input: Scenario = {
      ...base,
      paymentEvents: [
        { id: 'valid-date', dueOn: '2026-12-31', paidOn: '2026-12-31', amountCents: 100 },
        { id: 'last-date', dueOn: '9999-12-31', paidOn: '9999-12-31', amountCents: 100 },
      ],
    }
    const snapshot = JSON.stringify(input)
    expect(generateCandidateScenario(input, { ...parameters, lateDays: 1 }, 'outside-calendar'))
      .toEqual({
        success: false,
        issues: [{
          code: 'candidate_date_out_of_range',
          path: ['paymentEvents', 1, 'paidOn'],
          message: 'Generated payment date exceeds Gregorian year 9999.',
        }],
      })
    expect(JSON.stringify(input)).toBe(snapshot)
  })

  it('rejects invalid base dates rather than repairing them', () => {
    const input = scenarioFrom('2026-02-30')
    const result = generateCandidateScenario(input, parameters, 'invalid-base')
    expect(result.success).toBe(false)
    if (result.success) throw new Error('Expected base validation failure.')
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'validation_error', path: ['paymentEvents', 0, 'dueOn'], validationCode: 'custom' }),
    ]))
  })

  it('validates candidate IDs through the formal Scenario validator', () => {
    const result = generateCandidateScenario(base, parameters, 'invalid candidate id')
    expect(result.success).toBe(false)
    if (result.success) throw new Error('Expected candidate ID failure.')
    expect(result.issues[0]).toMatchObject({ code: 'validation_error', path: ['id'] })
    const issue = result.issues[0]
    if (!issue || issue.code !== 'validation_error') throw new Error('Expected validation issue.')
    expect(issue.validationCode).toBeDefined()
  })

  it.each([
    { purchaseCount: -1 },
    { purchaseCount: 31 },
    { purchaseCount: 0.5 },
    { purchaseCount: Number.MAX_SAFE_INTEGER },
    { purchaseAmountCents: 0 },
    { purchaseAmountCents: 100001 },
    { purchaseAmountCents: 1.5 },
    { purchaseAmountCents: NaN },
    { purchaseAmountCents: Infinity },
    { lateDays: -1 },
    { lateDays: 32 },
    { lateDays: 0.5 },
  ])('returns structured errors for invalid parameters %j before allocation', (invalid) => {
    const result = generateCandidateScenario(base, { ...parameters, ...invalid }, 'invalid-parameters')
    expect(result.success).toBe(false)
    if (result.success) throw new Error('Expected parameter validation failure.')
    expect(result.issues[0]).toMatchObject({ code: 'validation_error', path: ['parameters', Object.keys(invalid)[0]] })
  })

  it('refuses more than 30 base transactions rather than dropping them', () => {
    const input: Scenario = {
      ...base,
      transactions: Array.from({ length: 31 }, (_, index) => ({
        id: `original-${index}`,
        occurredOn: '2026-05-01',
        amountCents: 100,
        kind: 'purchase',
      })),
    }
    const result = generateCandidateScenario(input, parameters, 'over-capacity')
    expect(result.success).toBe(false)
    if (result.success) throw new Error('Expected capacity failure.')
    expect(result.issues[0]).toMatchObject({ code: 'capacity_exceeded', path: ['transactions'] })
    expect(input.transactions).toHaveLength(31)
  })

  it('refuses more than 5 existing payments rather than dropping obligations', () => {
    const input: Scenario = {
      ...base,
      paymentEvents: Array.from({ length: 6 }, (_, index) => ({
        id: `payment-${index}`,
        dueOn: '2026-05-01',
        paidOn: '2026-05-01',
        amountCents: 100,
      })),
    }
    const result = generateCandidateScenario(input, parameters, 'over-capacity')
    expect(result.success).toBe(false)
    if (result.success) throw new Error('Expected capacity failure.')
    expect(result.issues[0]).toMatchObject({ code: 'capacity_exceeded', path: ['paymentEvents'] })
    expect(input.paymentEvents).toHaveLength(6)
  })

  it('preserves all 5 obligations at the exact search capacity', () => {
    const input: Scenario = {
      ...base,
      paymentEvents: Array.from({ length: 5 }, (_, index) => ({
        id: `payment-${index}`,
        dueOn: '2026-05-01',
        paidOn: '2026-05-01',
        amountCents: 100 + index,
      })),
    }
    const generated = generate(input)
    expect(generated.paymentEvents).toHaveLength(5)
    expect(generated.paymentEvents.map((payment) => payment.amountCents)).toEqual([100, 101, 102, 103, 104])
    expect(generated.paymentEvents.every((payment) => payment.paidOn === '2026-05-03')).toBe(true)
  })

  it('keeps input values immutable and returned objects independent', () => {
    const input = structuredClone(base)
    const settings = { ...parameters }
    const snapshot = JSON.stringify({ input, settings })
    const generated = generate(input, settings)
    expect(JSON.stringify({ input, settings })).toBe(snapshot)
    const firstPayment = generated.paymentEvents[0]
    if (!firstPayment) throw new Error('Expected existing payment.')
    firstPayment.amountCents = 999
    firstPayment.dueOn = '2026-05-01'
    expect(JSON.stringify({ input, settings })).toBe(snapshot)
  })

  it('has deterministic JSON-serializable results', () => {
    const first = generateCandidateScenario(base, parameters, 'repeatable-candidate')
    const second = generateCandidateScenario(base, parameters, 'repeatable-candidate')
    expect(first).toEqual(second)
    expect(JSON.parse(JSON.stringify(first))).toEqual(first)
    if (!first.success) throw new Error('Expected valid candidate.')
    expect(validateScenario(JSON.parse(JSON.stringify(first.scenario))).success).toBe(true)
  })
})
