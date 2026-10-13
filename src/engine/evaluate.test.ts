import { describe, expect, it } from 'vitest'
import type { Contract, Scenario } from '../models'
import {
  compareContracts,
  evaluateContract,
  type Comparison,
  type EngineResult,
  type Evaluation,
} from './index'

function contract(rules: Contract['rules']): Contract {
  return {
    schemaVersion: 1,
    id: 'test-contract',
    name: 'Synthetic engine test contract',
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
    id: 'test-scenario',
    billingMonth,
    transactions: amounts.map((amountCents, index) => ({
      id: `purchase-${index + 1}`,
      occurredOn: `${billingMonth}-15`,
      amountCents,
      kind: 'purchase',
    })),
    paymentEvents,
  }
}

function payment(
  dueOn = '2026-05-15',
  paidOn = '2026-05-17',
  id = 'payment-1',
): Scenario['paymentEvents'][number] {
  return { id, dueOn, paidOn, amountCents: 10000 }
}

function success<T>(result: EngineResult<T>): T {
  expect(result.success).toBe(true)
  if (!result.success) throw new Error(JSON.stringify(result.issues))
  return result.data
}

function evaluate(contractInput: unknown, scenarioInput: unknown): Evaluation {
  return success(evaluateContract(contractInput, scenarioInput))
}

function compare(oldInput: unknown, newInput: unknown, scenarioInput: unknown): Comparison {
  return success(compareContracts(oldInput, newInput, scenarioInput))
}

function expectOverflow<T>(result: EngineResult<T>, path: (string | number)[]) {
  expect(result.success).toBe(false)
  expect(result).not.toHaveProperty('data')
  if (result.success) throw new Error('Expected a structured overflow failure.')
  expect(result.issues).toContainEqual({
    code: 'overflow',
    path,
    message: expect.any(String),
  })
  expect(result.issues.every((issue) => issue.message.length > 0)).toBe(true)
}

function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach((child: unknown) => freeze(child))
    Object.freeze(value)
  }
  return value
}

const allRules = {
  monthlyFee: { feeCents: 1200, waiver: { kind: 'minTransactionCount', threshold: 3 } },
  transactionFee: { fixedCents: 20, rateBps: 60 },
  lateFee: { feeCents: 1500, graceDays: 1 },
} satisfies Contract['rules']

describe('monthly fee evaluation', () => {
  it.each([
    { count: 2, waived: false, chargedCents: 1200 },
    { count: 3, waived: true, chargedCents: 0 },
    { count: 4, waived: true, chargedCents: 0 },
  ])('count threshold 3: $count purchases charges $chargedCents cents', ({ count, waived, chargedCents }) => {
    const data = evaluate(
      contract({ monthlyFee: allRules.monthlyFee }),
      scenario(Array<number>(count).fill(100)),
    )

    expect(data.monthlyFeeCents).toBe(chargedCents)
    expect(data.totalCents).toBe(chargedCents)
    expect(data.transactionFeeCents).toBe(0)
    expect(data.lateFeeCents).toBe(0)
    expect(data.trace).toEqual([{
      ruleType: 'monthlyFee',
      originalFeeCents: 1200,
      waiverKind: 'minTransactionCount',
      threshold: 3,
      actualTransactionCount: count,
      waived,
      chargedCents,
    }])
  })

  it.each([
    { amounts: [199, 300], actual: 499, waived: false, chargedCents: 1200 },
    { amounts: [200, 300], actual: 500, waived: true, chargedCents: 0 },
    { amounts: [201, 300], actual: 501, waived: true, chargedCents: 0 },
  ])('purchase total threshold 500: $actual cents charges $chargedCents cents', ({ amounts, actual, waived, chargedCents }) => {
    const data = evaluate(contract({
      monthlyFee: {
        feeCents: 1200,
        waiver: { kind: 'minPurchaseTotalCents', threshold: 500 },
      },
    }), scenario(amounts))

    expect(data.monthlyFeeCents).toBe(chargedCents)
    expect(data.trace).toEqual([{
      ruleType: 'monthlyFee',
      originalFeeCents: 1200,
      waiverKind: 'minPurchaseTotalCents',
      threshold: 500,
      actualPurchaseTotalCents: actual,
      waived,
      chargedCents,
    }])
  })

  it('includes purchases from both calendar-month boundaries', () => {
    const input = scenario([200, 300])
    input.transactions[0]!.occurredOn = '2026-05-01'
    input.transactions[1]!.occurredOn = '2026-05-31'
    const data = evaluate(contract({
      monthlyFee: {
        feeCents: 1200,
        waiver: { kind: 'minPurchaseTotalCents', threshold: 500 },
      },
    }), input)

    expect(data.monthlyFeeCents).toBe(0)
    expect(data.trace[0]).toMatchObject({ actualPurchaseTotalCents: 500, waived: true })
  })

  it('does not sum unused purchase amounts for a count waiver', () => {
    const data = evaluate(contract({
      monthlyFee: { feeCents: 1200, waiver: { kind: 'minTransactionCount', threshold: 2 } },
    }), scenario([Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]))

    expect(data.totalCents).toBe(0)
    expect(data.trace[0]).toMatchObject({ actualTransactionCount: 2, waived: true })
    expect(data.trace[0]).not.toHaveProperty('actualPurchaseTotalCents')
  })
})

describe('transaction fee evaluation', () => {
  it.each([
    { rateBps: 40, variableFeeCents: 0 },
    { rateBps: 50, variableFeeCents: 1 },
    { rateBps: 60, variableFeeCents: 1 },
    { rateBps: 100, variableFeeCents: 1 },
  ])('100 cents at $rateBps bps has an exactly rounded $variableFeeCents-cent variable fee', ({ rateBps, variableFeeCents }) => {
    const data = evaluate(contract({ transactionFee: { fixedCents: 20, rateBps } }), scenario([100]))

    expect(data.totalCents).toBe(20 + variableFeeCents)
    expect(data.trace).toEqual([{
      ruleType: 'transactionFee',
      transactionId: 'purchase-1',
      amountCents: 100,
      fixedCents: 20,
      rateBps,
      variableFeeCents,
      chargedCents: 20 + variableFeeCents,
    }])
  })

  it('rounds two 0.4-cent fees separately to zero; one combined 0.8-cent fee rounds to one', () => {
    const input = contract({ transactionFee: { fixedCents: 0, rateBps: 40 } })
    const separate = evaluate(input, scenario([100, 100]))
    const combined = evaluate(input, scenario([200]))

    expect(separate.transactionFeeCents).toBe(0)
    expect(separate.trace.map((entry) => entry.chargedCents)).toEqual([0, 0])
    expect(combined.transactionFeeCents).toBe(1)
  })

  it('adds the fixed fee after rounding every variable fee, then sums charges', () => {
    const data = evaluate(contract({ transactionFee: { fixedCents: 20, rateBps: 60 } }), scenario([100, 250, 1000]))

    expect(data.transactionFeeCents).toBe(21 + 22 + 26)
    expect(data.totalCents).toBe(69)
    expect(data.trace.map((entry) => entry.chargedCents)).toEqual([21, 22, 26])
  })

  it.each([0, 10000])('accepts the boundary rate %i bps', (rateBps) => {
    const data = evaluate(contract({ transactionFee: { fixedCents: 0, rateBps } }), scenario([123]))
    expect(data.transactionFeeCents).toBe(rateBps === 0 ? 0 : 123)
  })

  it('keeps zero-rate, zero-fixed-fee transactions in the trace', () => {
    const data = evaluate(contract({ transactionFee: { fixedCents: 0, rateBps: 0 } }), scenario([100]))
    expect(data.trace).toHaveLength(1)
    expect(data.trace[0]).toMatchObject({ variableFeeCents: 0, chargedCents: 0 })
    expect(data.totalCents).toBe(0)
  })

  it('does not sum purchase amounts when only transaction fees need evaluation', () => {
    const data = evaluate(contract({ transactionFee: { fixedCents: 0, rateBps: 0 } }), scenario([
      Number.MAX_SAFE_INTEGER,
      Number.MAX_SAFE_INTEGER,
    ]))

    expect(data.transactionFeeCents).toBe(0)
    expect(data.trace).toHaveLength(2)
  })

  it('calculates a safe result near MAX_SAFE_INTEGER without losing multiplication precision', () => {
    const data = evaluate(contract({ transactionFee: { fixedCents: 0, rateBps: 9999 } }), scenario([Number.MAX_SAFE_INTEGER]))
    expect(data.transactionFeeCents).toBe(9006298534815517)
    expect(data.trace[0]).toMatchObject({ variableFeeCents: 9006298534815517 })
    expect(Number.isSafeInteger(data.totalCents)).toBe(true)
  })
})

describe('late fee evaluation by Gregorian calendar day', () => {
  it.each([
    { name: 'early payment', paidOn: '2026-05-14', lateDays: 0, chargedCents: 0 },
    { name: 'on-time payment', paidOn: '2026-05-15', lateDays: 0, chargedCents: 0 },
    { name: 'the exact one-day grace boundary', paidOn: '2026-05-16', lateDays: 1, chargedCents: 0 },
    { name: 'one day beyond the grace boundary', paidOn: '2026-05-17', lateDays: 2, chargedCents: 1500 },
  ])('$name charges $chargedCents cents', ({ paidOn, lateDays, chargedCents }) => {
    const data = evaluate(contract({ lateFee: { feeCents: 1500, graceDays: 1 } }), scenario([], [payment('2026-05-15', paidOn)]))

    expect(data.lateFeeCents).toBe(chargedCents)
    expect(data.totalCents).toBe(chargedCents)
    expect(data.trace).toEqual([{
      ruleType: 'lateFee',
      paymentEventId: 'payment-1',
      dueOn: '2026-05-15',
      paidOn,
      originalFeeCents: 1500,
      lateDays,
      graceDays: 1,
      graceExceeded: lateDays > 1,
      chargedCents,
    }])
  })

  it.each([
    { dueOn: '2026-05-31', paidOn: '2026-06-02', lateDays: 2 },
    { dueOn: '2026-12-31', paidOn: '2027-01-02', lateDays: 2 },
    { dueOn: '2024-02-28', paidOn: '2024-03-01', lateDays: 2 },
    { dueOn: '2000-02-28', paidOn: '2000-03-01', lateDays: 2 },
    { dueOn: '1900-02-28', paidOn: '1900-03-01', lateDays: 1 },
    { dueOn: '0001-01-01', paidOn: '0001-01-02', lateDays: 1 },
    { dueOn: '9999-12-30', paidOn: '9999-12-31', lateDays: 1 },
    { dueOn: '0001-01-01', paidOn: '9999-12-31', lateDays: 3652058 },
  ])('$dueOn to $paidOn spans $lateDays calendar days', ({ dueOn, paidOn, lateDays }) => {
    const data = evaluate(contract({ lateFee: { feeCents: 1500, graceDays: 0 } }), scenario([], [payment(dueOn, paidOn)]))

    expect(data.lateFeeCents).toBe(1500)
    expect(data.trace[0]).toMatchObject({ dueOn, paidOn, lateDays, graceExceeded: true, chargedCents: 1500 })
  })

  it('accepts an early payment across year boundaries with zero late days', () => {
    const data = evaluate(contract({ lateFee: { feeCents: 1500, graceDays: 0 } }), scenario([], [payment('2026-01-01', '2025-12-30')]))
    expect(data.lateFeeCents).toBe(0)
    expect(data.trace[0]).toMatchObject({ lateDays: 0, graceExceeded: false, chargedCents: 0 })
  })

  it('charges each completed late payment independently', () => {
    const data = evaluate(contract({ lateFee: { feeCents: 1500, graceDays: 1 } }), scenario([], [
      payment('2026-05-15', '2026-05-17', 'second-payment'),
      payment('2026-05-15', '2026-05-15', 'on-time-payment'),
      payment('2026-05-15', '2026-05-18', 'first-payment'),
    ]))

    expect(data.lateFeeCents).toBe(3000)
    expect(data.trace.map((entry) => entry.chargedCents)).toEqual([1500, 0, 1500])
  })
})

describe('evaluation output and rule composition', () => {
  it.each([
    { name: 'monthly fee only', rules: { monthlyFee: allRules.monthlyFee }, monthly: 1200, traceCount: 1 },
    { name: 'transaction fee only', rules: { transactionFee: allRules.transactionFee }, monthly: 0, traceCount: 0 },
    { name: 'late fee only', rules: { lateFee: allRules.lateFee }, monthly: 0, traceCount: 0 },
    { name: 'all rules', rules: allRules, monthly: 1200, traceCount: 1 },
  ])('$name with no transactions or payments', ({ rules, monthly, traceCount }) => {
    const data = evaluate(contract(rules), scenario())
    expect(data).toMatchObject({
      contractId: 'test-contract',
      contractVersion: '1.0.0',
      scenarioId: 'test-scenario',
      currency: 'USD',
      monthlyFeeCents: monthly,
      transactionFeeCents: 0,
      lateFeeCents: 0,
      totalCents: monthly,
    })
    expect(data.trace).toHaveLength(traceCount)
  })

  it('evaluates all rules and preserves monthly, transaction, payment trace order', () => {
    const input = scenario([100, 1000], [
      payment('2026-05-15', '2026-05-17', 'z-payment'),
      payment('2026-05-15', '2026-05-15', 'a-payment'),
    ])
    input.transactions[0]!.id = 'z-purchase'
    input.transactions[1]!.id = 'a-purchase'
    const data = evaluate(contract(allRules), input)

    expect(data).toMatchObject({ monthlyFeeCents: 1200, transactionFeeCents: 47, lateFeeCents: 1500, totalCents: 2747 })
    expect(data.trace.map((entry) => entry.ruleType)).toEqual([
      'monthlyFee', 'transactionFee', 'transactionFee', 'lateFee', 'lateFee',
    ])
    expect(data.trace[1]).toMatchObject({ transactionId: 'z-purchase', chargedCents: 21 })
    expect(data.trace[2]).toMatchObject({ transactionId: 'a-purchase', chargedCents: 26 })
    expect(data.trace[3]).toMatchObject({ paymentEventId: 'z-payment', chargedCents: 1500 })
    expect(data.trace[4]).toMatchObject({ paymentEventId: 'a-payment', chargedCents: 0 })
    expect(data.trace.reduce((sum, entry) => sum + entry.chargedCents, 0)).toBe(data.totalCents)
    for (const [ruleType, amount] of [
      ['monthlyFee', data.monthlyFeeCents],
      ['transactionFee', data.transactionFeeCents],
      ['lateFee', data.lateFeeCents],
    ] as const) {
      expect(data.trace.filter((entry) => entry.ruleType === ruleType).reduce((sum, entry) => sum + entry.chargedCents, 0)).toBe(amount)
    }
  })

  it('retains a zero original monthly fee even when the waiver fails', () => {
    const data = evaluate(contract({
      monthlyFee: { feeCents: 0, waiver: { kind: 'minTransactionCount', threshold: 1 } },
    }), scenario())
    expect(data.trace).toHaveLength(1)
    expect(data.trace[0]).toMatchObject({ originalFeeCents: 0, waived: false, chargedCents: 0 })
  })

  it('emits canonical zero for valid negative-zero inputs so JSON round trips remain identical', () => {
    const input = contract({
      monthlyFee: { feeCents: -0, waiver: { kind: 'minTransactionCount', threshold: 1 } },
      transactionFee: { fixedCents: -0, rateBps: -0 },
      lateFee: { feeCents: -0, graceDays: -0 },
    })
    for (const inputScenario of [scenario(), scenario([100], [payment()])]) {
      const data = evaluate(input, inputScenario)
      expect(data.totalCents).toBe(0)
      expect(JSON.parse(JSON.stringify(data))).toEqual(data)
    }
    expect(Object.is(input.rules.monthlyFee?.feeCents, -0)).toBe(true)
    expect(Object.is(input.rules.transactionFee?.rateBps, -0)).toBe(true)
    expect(Object.is(input.rules.lateFee?.graceDays, -0)).toBe(true)
  })

  it('omits traces for disabled rules despite transactions and payments', () => {
    const data = evaluate(contract({ transactionFee: { fixedCents: 0, rateBps: 0 } }), scenario([100], [payment()]))
    expect(data.monthlyFeeCents).toBe(0)
    expect(data.lateFeeCents).toBe(0)
    expect(data.trace.map((entry) => entry.ruleType)).toEqual(['transactionFee'])
  })

  it('evaluates frozen inputs without mutation and returns fresh independent data', () => {
    const inputContract = freeze(contract(allRules))
    const inputScenario = freeze(scenario([100, 1000], [payment()]))
    const before = JSON.stringify({ inputContract, inputScenario })
    const first = evaluate(inputContract, inputScenario)
    const second = evaluate(inputContract, inputScenario)

    expect(JSON.stringify({ inputContract, inputScenario })).toBe(before)
    expect(second).toEqual(first)
    expect(second).not.toBe(first)
    expect(second.trace).not.toBe(first.trace)
    first.trace[0]!.chargedCents = 999
    expect(second.trace[0]!.chargedCents).toBe(1200)
    expect(JSON.stringify({ inputContract, inputScenario })).toBe(before)
  })

  it('repeats deterministically and survives JSON serialization of both input and output', () => {
    const inputContract = contract(allRules)
    const inputScenario = scenario([100, 1000], [payment()])
    const first = evaluateContract(inputContract, inputScenario)

    for (let attempt = 0; attempt < 3; attempt++) {
      expect(evaluateContract(inputContract, inputScenario)).toEqual(first)
    }
    expect(evaluateContract(JSON.parse(JSON.stringify(inputContract)), JSON.parse(JSON.stringify(inputScenario)))).toEqual(first)
    expect(JSON.parse(JSON.stringify(first))).toEqual(first)
  })
})

describe('structured evaluation overflow failures', () => {
  it('accepts MAX_SAFE_INTEGER cents exactly when the total is still safe', () => {
    const data = evaluate(contract({ transactionFee: { fixedCents: 0, rateBps: 10000 } }), scenario([Number.MAX_SAFE_INTEGER]))
    expect(data.totalCents).toBe(Number.MAX_SAFE_INTEGER)
  })

  it('rejects a single transaction fixed-plus-variable charge above MAX_SAFE_INTEGER', () => {
    const result = evaluateContract(contract({ transactionFee: { fixedCents: Number.MAX_SAFE_INTEGER, rateBps: 10000 } }), scenario([1]))
    expectOverflow(result, ['trace', 0, 'chargedCents'])
  })

  it('rejects the transaction category when safe individual charges overflow in aggregate', () => {
    const result = evaluateContract(contract({ transactionFee: { fixedCents: 0, rateBps: 10000 } }), scenario([Number.MAX_SAFE_INTEGER, 1]))
    expectOverflow(result, ['transactionFeeCents'])
  })

  it('rejects the late category when safe per-payment charges overflow in aggregate', () => {
    const result = evaluateContract(contract({ lateFee: { feeCents: Number.MAX_SAFE_INTEGER, graceDays: 0 } }), scenario([], [
      payment('2026-05-15', '2026-05-16', 'payment-one'),
      payment('2026-05-15', '2026-05-16', 'payment-two'),
    ]))
    expectOverflow(result, ['lateFeeCents'])
  })

  it('rejects the evaluation total when independently safe categories exceed MAX_SAFE_INTEGER', () => {
    const result = evaluateContract(contract({
      monthlyFee: { feeCents: Number.MAX_SAFE_INTEGER, waiver: { kind: 'minTransactionCount', threshold: 2 } },
      transactionFee: { fixedCents: 1, rateBps: 0 },
    }), scenario([1]))
    expectOverflow(result, ['totalCents'])
  })

  it('reports purchase-total trace overflow even though the waiver would eliminate the monthly fee', () => {
    const result = evaluateContract(contract({
      monthlyFee: { feeCents: 1200, waiver: { kind: 'minPurchaseTotalCents', threshold: 1 } },
    }), scenario([Number.MAX_SAFE_INTEGER, 1]))
    expectOverflow(result, ['trace', 0, 'actualPurchaseTotalCents'])
  })

  it('keeps an overflowing result deterministic, structured, and JSON serializable', () => {
    const input = contract({ transactionFee: { fixedCents: Number.MAX_SAFE_INTEGER, rateBps: 10000 } })
    const inputScenario = scenario([1])
    const first = evaluateContract(input, inputScenario)
    expect(first.success).toBe(false)
    expect(evaluateContract(input, inputScenario)).toEqual(first)
    expect(JSON.parse(JSON.stringify(first))).toEqual(first)
  })
})

describe('public APIs use the Stage 2 runtime validators', () => {
  it.each([undefined, null, 'contract', 1, []])('rejects invalid contract input %j', (input) => {
    const result = evaluateContract(input, scenario())
    expect(result.success).toBe(false)
    expect(result).not.toHaveProperty('data')
    if (result.success) throw new Error('Expected contract validation failure.')
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'validation_error', path: ['contract'] }))
  })

  it.each([undefined, null, 'scenario', 1, []])('rejects invalid scenario input %j', (input) => {
    const result = evaluateContract(contract(allRules), input)
    expect(result.success).toBe(false)
    expect(result).not.toHaveProperty('data')
    if (result.success) throw new Error('Expected scenario validation failure.')
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'validation_error', path: ['scenario'] }))
  })

  it.each([
    { name: 'unsupported contract schema version', change: { schemaVersion: 2 }, path: ['schemaVersion'] },
    { name: 'unsupported currency', change: { currency: 'EUR' }, path: ['currency'] },
    { name: 'invalid effective date', change: { effectiveDate: '2026-02-30' }, path: ['effectiveDate'] },
    { name: 'blank ID', change: { id: ' ' }, path: ['id'] },
    { name: 'no fee rules', change: { rules: {} }, path: ['rules'] },
    { name: 'unknown fee rule', change: { rules: { interest: { rateBps: 10 } } }, path: ['rules'] },
    { name: 'unknown waiver kind', change: { rules: { monthlyFee: { feeCents: 1200, waiver: { kind: 'balance', threshold: 1 } } } }, path: ['rules', 'monthlyFee', 'waiver', 'kind'] },
    { name: 'unsupported rate', change: { rules: { transactionFee: { fixedCents: 0, rateBps: 10001 } } }, path: ['rules', 'transactionFee', 'rateBps'] },
  ])('rejects $name with a contract-prefixed structured path', ({ change, path }) => {
    const result = evaluateContract({ ...contract(allRules), ...change }, scenario())
    expect(result.success).toBe(false)
    if (result.success) throw new Error('Expected invalid contract failure.')
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'validation_error', path: ['contract', ...path] }))
    expect(result.issues.every((issue) => typeof issue.message === 'string' && issue.message.length > 0)).toBe(true)
  })

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])('rejects invalid purchase amount %s at the scenario-prefixed path', (amount) => {
    const result = evaluateContract(contract(allRules), scenario([amount]))
    expect(result.success).toBe(false)
    if (result.success) throw new Error('Expected invalid amount failure.')
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'validation_error',
      path: ['scenario', 'transactions', 0, 'amountCents'],
    }))
  })

  it('rejects a purchase outside the billing month', () => {
    const input = scenario([100])
    input.transactions[0]!.occurredOn = '2026-06-01'
    const result = evaluateContract(contract(allRules), input)
    expect(result.success).toBe(false)
    if (result.success) throw new Error('Expected invalid billing-month failure.')
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'validation_error',
      path: ['scenario', 'transactions', 0, 'occurredOn'],
    }))
  })

  it('rejects duplicate transaction IDs rather than counting the same purchase twice', () => {
    const input = scenario([100, 100])
    input.transactions[1]!.id = input.transactions[0]!.id
    const result = evaluateContract(contract(allRules), input)
    expect(result.success).toBe(false)
    if (result.success) throw new Error('Expected duplicate ID failure.')
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'validation_error',
      path: ['scenario', 'transactions', 1, 'id'],
    }))
  })

  it('rejects unknown fields instead of silently discarding them', () => {
    const result = evaluateContract({ ...contract(allRules), apiKey: 'synthetic-unknown-field' }, { ...scenario(), balanceCents: 10 })
    expect(result.success).toBe(false)
    if (result.success) throw new Error('Expected strict object failure.')
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'validation_error', path: ['contract'] }))
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'validation_error', path: ['scenario'] }))
  })
})

describe('counterfactual comparison', () => {
  it('returns zero total and category differences for identical contracts', () => {
    const input = contract(allRules)
    const data = compare(input, input, scenario([100, 1000], [payment()]))
    expect(data.oldEvaluation).toEqual(data.newEvaluation)
    expect(data.deltaCents).toBe(0)
    expect(data.deltaByCategoryCents).toEqual({ monthlyFeeCents: 0, transactionFeeCents: 0, lateFeeCents: 0 })
  })

  it('returns negative deltas when the new contract costs less', () => {
    const data = compare(
      contract({ transactionFee: { fixedCents: 20, rateBps: 100 } }),
      contract({ transactionFee: { fixedCents: 0, rateBps: 60 } }),
      scenario([100, 100]),
    )
    expect(data.oldEvaluation.totalCents).toBe(42)
    expect(data.newEvaluation.totalCents).toBe(2)
    expect(data.deltaCents).toBe(-40)
    expect(data.deltaByCategoryCents).toEqual({ monthlyFeeCents: 0, transactionFeeCents: -40, lateFeeCents: 0 })
  })

  it.each([
    { category: 'monthlyFeeCents', removedRule: 'monthlyFee', expected: -1200 },
    { category: 'transactionFeeCents', removedRule: 'transactionFee', expected: -21 },
    { category: 'lateFeeCents', removedRule: 'lateFee', expected: -1500 },
  ] as const)('removing $removedRule yields a $expected-cent $category delta', ({ category, removedRule, expected }) => {
    const nextRules = { ...allRules }
    delete nextRules[removedRule]
    const data = compare(contract(allRules), contract(nextRules), scenario([100], [payment()]))
    expect(data.newEvaluation[category]).toBe(0)
    expect(data.deltaByCategoryCents[category]).toBe(expected)
    expect(data.deltaCents).toBe(expected)
    expect(data.newEvaluation.trace.some((entry) => entry.ruleType === removedRule)).toBe(false)
  })

  it('uses one scenario for both evaluations and accepts future descriptive effective dates', () => {
    const oldInput = contract(allRules)
    oldInput.id = 'old-contract'
    oldInput.effectiveDate = '9999-12-30'
    const newInput = contract(allRules)
    newInput.id = 'new-contract'
    newInput.version = '2.0.0'
    newInput.effectiveDate = '9999-12-31'
    const data = compare(oldInput, newInput, scenario([100], [payment()]))
    expect(data.oldEvaluation.scenarioId).toBe('test-scenario')
    expect(data.newEvaluation.scenarioId).toBe('test-scenario')
    expect(data.oldEvaluation.contractId).toBe('old-contract')
    expect(data.newEvaluation.contractId).toBe('new-contract')
    expect(data.newEvaluation.contractVersion).toBe('2.0.0')
    expect(data.deltaCents).toBe(0)
  })

  it('sums mixed positive and negative category deltas to the exact total delta', () => {
    const data = compare(contract(allRules), contract({
      monthlyFee: { feeCents: 1000, waiver: { kind: 'minTransactionCount', threshold: 3 } },
      transactionFee: { fixedCents: 25, rateBps: 60 },
      lateFee: { feeCents: 1600, graceDays: 1 },
    }), scenario([100], [payment()]))

    expect(data.deltaByCategoryCents).toEqual({ monthlyFeeCents: -200, transactionFeeCents: 5, lateFeeCents: 100 })
    expect(data.deltaCents).toBe(-95)
    expect(Object.values(data.deltaByCategoryCents).reduce((sum, amount) => sum + amount, 0)).toBe(data.deltaCents)
    expect(data.newEvaluation.totalCents - data.oldEvaluation.totalCents).toBe(data.deltaCents)
  })

  it.each([
    { oldFee: 0, newFee: Number.MAX_SAFE_INTEGER, expected: Number.MAX_SAFE_INTEGER },
    { oldFee: Number.MAX_SAFE_INTEGER, newFee: 0, expected: -Number.MAX_SAFE_INTEGER },
  ])('handles a signed safe boundary delta of $expected cents exactly', ({ oldFee, newFee, expected }) => {
    const data = compare(
      contract({ lateFee: { feeCents: oldFee, graceDays: 0 } }),
      contract({ lateFee: { feeCents: newFee, graceDays: 0 } }),
      scenario([], [payment()]),
    )
    expect(data.deltaCents).toBe(expected)
    expect(data.deltaByCategoryCents.lateFeeCents).toBe(expected)
    expect(Number.isSafeInteger(data.deltaCents)).toBe(true)
    expect(JSON.parse(JSON.stringify(data))).toEqual(data)
  })

  it('does not mutate either frozen contract or the shared frozen scenario', () => {
    const oldInput = freeze(contract(allRules))
    const newInput = freeze(contract({ transactionFee: { fixedCents: 0, rateBps: 100 } }))
    const inputScenario = freeze(scenario([100, 1000], [payment()]))
    const before = JSON.stringify({ oldInput, newInput, inputScenario })
    const first = compareContracts(oldInput, newInput, inputScenario)
    const second = compareContracts(oldInput, newInput, inputScenario)
    expect(second).toEqual(first)
    expect(JSON.stringify({ oldInput, newInput, inputScenario })).toBe(before)
    expect(JSON.parse(JSON.stringify(first))).toEqual(first)
    expect(compareContracts(
      JSON.parse(JSON.stringify(oldInput)),
      JSON.parse(JSON.stringify(newInput)),
      JSON.parse(JSON.stringify(inputScenario)),
    )).toEqual(first)
  })

  it.each(['oldContract', 'newContract', 'scenario'] as const)('rejects invalid $0 input without partial evaluation data', (field) => {
    const valid = contract(allRules)
    const validScenario = scenario([100], [payment()])
    const result = compareContracts(
      field === 'oldContract' ? null : valid,
      field === 'newContract' ? null : valid,
      field === 'scenario' ? null : validScenario,
    )
    expect(result.success).toBe(false)
    expect(result).not.toHaveProperty('data')
    expect(result).not.toHaveProperty('oldEvaluation')
    expect(result).not.toHaveProperty('newEvaluation')
    expect(result).not.toHaveProperty('deltaCents')
    if (result.success) throw new Error('Expected comparison validation failure.')
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'validation_error', path: [field] }))
  })

  it.each(['oldEvaluation', 'newEvaluation'] as const)('rejects $0 overflow without returning the other successful evaluation', (field) => {
    const safe = contract({ transactionFee: { fixedCents: 0, rateBps: 0 } })
    const overflowing = contract({ transactionFee: { fixedCents: Number.MAX_SAFE_INTEGER, rateBps: 10000 } })
    const result = compareContracts(
      field === 'oldEvaluation' ? overflowing : safe,
      field === 'newEvaluation' ? overflowing : safe,
      scenario([1]),
    )
    expectOverflow(result, [field, 'trace', 0, 'chargedCents'])
    expect(result).not.toHaveProperty('oldEvaluation')
    expect(result).not.toHaveProperty('newEvaluation')
    expect(result).not.toHaveProperty('deltaCents')
    expect(JSON.parse(JSON.stringify(result))).toEqual(result)
  })
})
