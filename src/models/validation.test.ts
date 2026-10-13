import { describe, expect, it } from 'vitest'
import {
  BillingMonthSchema,
  CalendarDateSchema,
  ContractSchema,
  IdSchema,
  LateFeeRuleSchema,
  MonthlyFeeRuleSchema,
  PaymentEventSchema,
  ScenarioSchema,
  SemverSchema,
  TransactionFeeRuleSchema,
  TransactionSchema,
  WaiverSchema,
  validateContract,
  validateScenario,
  type Contract,
  type Scenario,
} from './index'

function validContract(): Contract {
  return {
    schemaVersion: 1,
    id: 'contract-v1',
    name: 'Synthetic contract',
    version: '1.0.0',
    currency: 'USD',
    billingCycle: 'calendar-month',
    effectiveDate: '2026-05-01',
    rules: {
      monthlyFee: {
        feeCents: 1200,
        waiver: { kind: 'minTransactionCount', threshold: 5 },
      },
      transactionFee: { fixedCents: 20, rateBps: 60 },
      lateFee: { feeCents: 1500, graceDays: 3 },
    },
  }
}

function validScenario(): Scenario {
  return {
    schemaVersion: 1,
    id: 'scenario-v1',
    billingMonth: '2026-05',
    transactions: [validTransaction()],
    paymentEvents: [validPaymentEvent()],
  }
}

function validTransaction(): Scenario['transactions'][number] {
  return { id: 'purchase-1', occurredOn: '2026-05-10', amountCents: 1000, kind: 'purchase' }
}

function validPaymentEvent(): Scenario['paymentEvents'][number] {
  return { id: 'payment-1', dueOn: '2026-05-15', paidOn: '2026-05-17', amountCents: 1000 }
}

const invalidAmounts = [
  ['negative', -1],
  ['fractional', 1.5],
  ['NaN', Number.NaN],
  ['positive infinity', Number.POSITIVE_INFINITY],
  ['negative infinity', Number.NEGATIVE_INFINITY],
  ['unsafe integer', Number.MAX_SAFE_INTEGER + 1],
  ['numeric string', '100'],
  ['null', null],
] as const

describe('calendar dates and billing months', () => {
  it.each(['0001-01-01', '2000-02-29', '2024-02-29', '2026-02-28', '9999-12-31'])(
    'accepts the valid Gregorian date %s',
    (date) => expect(CalendarDateSchema.safeParse(date).success).toBe(true),
  )

  it.each([
    '0000-01-01',
    '2026-02-30',
    '2026-02-29',
    '1900-02-29',
    '2100-02-29',
    '2026-04-31',
    '2026-00-01',
    '2026-13-01',
    '2026-01-00',
    '2026-01-32',
    '2026-5-01',
    '2026-05-1',
    '10000-01-01',
    '2026-05-01T00:00:00Z',
    ' 2026-05-01',
    '',
  ])('rejects the invalid calendar date %s', (date) => {
    expect(CalendarDateSchema.safeParse(date).success).toBe(false)
  })

  it.each(['0001-01', '2026-05', '9999-12'])('accepts billing month %s', (month) => {
    expect(BillingMonthSchema.safeParse(month).success).toBe(true)
  })

  it.each(['0000-01', '2026-00', '2026-13', '2026-5', '2026-05-01', '10000-01', '']) (
    'rejects invalid billing month %s',
    (month) => expect(BillingMonthSchema.safeParse(month).success).toBe(false),
  )

  it('rejects date and month values of the wrong runtime type', () => {
    expect(CalendarDateSchema.safeParse(20260501).success).toBe(false)
    expect(BillingMonthSchema.safeParse(null).success).toBe(false)
  })
})

describe('identifiers, names, and versions', () => {
  it.each(['a', 'Contract-1_v2', 'x'.repeat(64)])('accepts valid identifier %s', (id) => {
    expect(IdSchema.safeParse(id).success).toBe(true)
  })

  it.each(['', ' ', ' leading', 'trailing ', 'has space', '-leading', '_leading', 'id/path', 'id\n', '中文', 'x'.repeat(65)])(
    'rejects invalid identifier %s',
    (id) => {
      expect(IdSchema.safeParse(id).success).toBe(false)
      expect(validateContract({ ...validContract(), id }).success).toBe(false)
      expect(validateScenario({ ...validScenario(), id }).success).toBe(false)
    },
  )

  it.each(['0.0.0', '1.2.3', '1.2.3-alpha.1', '1.2.3-alpha.1+build.007'])(
    'accepts complete SemVer %s',
    (version) => expect(SemverSchema.safeParse(version).success).toBe(true),
  )

  it.each(['1', '1.2', 'v1.2.3', '01.2.3', '1.02.3', '1.2.03', '1.2.3-01', '1.2.3-', '1.2.3+', '1.2.3 a', '1.2.3\n']) (
    'rejects invalid SemVer %s',
    (version) => expect(SemverSchema.safeParse(version).success).toBe(false),
  )

  it('limits SemVer length and rejects blank or oversized contract names', () => {
    expect(SemverSchema.safeParse(`1.2.3+${'x'.repeat(122)}`).success).toBe(true)
    expect(SemverSchema.safeParse(`1.2.3+${'x'.repeat(123)}`).success).toBe(false)
    for (const name of ['', ' \t\n', 'x'.repeat(121)]) {
      expect(validateContract({ ...validContract(), name }).success).toBe(false)
    }
    expect(validateContract({ ...validContract(), name: 'x'.repeat(120) }).success).toBe(true)
  })
})

describe('financial rule units and boundaries', () => {
  it.each(invalidAmounts)('rejects %s values in every cents field', (_label, amount) => {
    expect(MonthlyFeeRuleSchema.safeParse({ feeCents: amount, waiver: { kind: 'minTransactionCount', threshold: 1 } }).success).toBe(false)
    expect(TransactionFeeRuleSchema.safeParse({ fixedCents: amount, rateBps: 100 }).success).toBe(false)
    expect(LateFeeRuleSchema.safeParse({ feeCents: amount, graceDays: 0 }).success).toBe(false)
    expect(TransactionSchema.safeParse({ ...validTransaction(), amountCents: amount }).success).toBe(false)
    expect(PaymentEventSchema.safeParse({ ...validPaymentEvent(), amountCents: amount }).success).toBe(false)
    expect(WaiverSchema.safeParse({ kind: 'minPurchaseTotalCents', threshold: amount }).success).toBe(false)
  })

  it.each([0, Number.MAX_SAFE_INTEGER])('accepts nonnegative safe fee boundary %s', (amount) => {
    expect(MonthlyFeeRuleSchema.safeParse({ feeCents: amount, waiver: { kind: 'minTransactionCount', threshold: 1 } }).success).toBe(true)
    expect(TransactionFeeRuleSchema.safeParse({ fixedCents: amount, rateBps: 0 }).success).toBe(true)
    expect(LateFeeRuleSchema.safeParse({ feeCents: amount, graceDays: 0 }).success).toBe(true)
  })

  it.each([1, Number.MAX_SAFE_INTEGER])('accepts positive safe purchase/payment amount boundary %s', (amount) => {
    expect(TransactionSchema.safeParse({ ...validTransaction(), amountCents: amount }).success).toBe(true)
    expect(PaymentEventSchema.safeParse({ ...validPaymentEvent(), amountCents: amount }).success).toBe(true)
    expect(WaiverSchema.safeParse({ kind: 'minPurchaseTotalCents', threshold: amount }).success).toBe(true)
  })

  it('rejects zero purchase and payment amounts and zero waiver thresholds', () => {
    expect(TransactionSchema.safeParse({ ...validTransaction(), amountCents: 0 }).success).toBe(false)
    expect(PaymentEventSchema.safeParse({ ...validPaymentEvent(), amountCents: 0 }).success).toBe(false)
    for (const kind of ['minTransactionCount', 'minPurchaseTotalCents']) {
      expect(WaiverSchema.safeParse({ kind, threshold: 0 }).success).toBe(false)
    }
  })

  it.each([-1, 0, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, '5'])(
    'rejects invalid transaction-count threshold %s',
    (threshold) => expect(WaiverSchema.safeParse({ kind: 'minTransactionCount', threshold }).success).toBe(false),
  )

  it.each([1, Number.MAX_SAFE_INTEGER])('accepts safe count threshold %s', (threshold) => {
    expect(WaiverSchema.safeParse({ kind: 'minTransactionCount', threshold }).success).toBe(true)
  })

  it.each([0, 1, 10000])('accepts integer rateBps boundary %s', (rateBps) => {
    expect(TransactionFeeRuleSchema.safeParse({ fixedCents: 0, rateBps }).success).toBe(true)
  })

  it.each([-1, 10001, 0.5, Number.NaN, Number.POSITIVE_INFINITY, '60'])(
    'rejects invalid rateBps %s',
    (rateBps) => expect(TransactionFeeRuleSchema.safeParse({ fixedCents: 0, rateBps }).success).toBe(false),
  )

  it.each([0, 1, Number.MAX_SAFE_INTEGER])('accepts nonnegative safe graceDays %s', (graceDays) => {
    expect(LateFeeRuleSchema.safeParse({ feeCents: 0, graceDays }).success).toBe(true)
  })

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, '3'])(
    'rejects invalid graceDays %s',
    (graceDays) => expect(LateFeeRuleSchema.safeParse({ feeCents: 0, graceDays }).success).toBe(false),
  )

  it.each([
    {},
    { kind: 'unknown', threshold: 5 },
    { kind: 'minTransactionCount' },
    { kind: 'minPurchaseTotalCents', threshold: 1, currency: 'USD' },
    { kind: 'minTransactionCount', threshold: 1, count: 1 },
  ])('rejects missing, unknown, or extra waiver fields: %j', (waiver) => {
    expect(WaiverSchema.safeParse(waiver).success).toBe(false)
  })
})

describe('Contract v1 runtime validation', () => {
  it('accepts each independent rule and their combined contract', () => {
    const contract = validContract()
    expect(ContractSchema.safeParse(contract).success).toBe(true)
    for (const [kind, rule] of Object.entries(contract.rules)) {
      expect(validateContract({ ...contract, rules: { [kind]: rule } }).success).toBe(true)
    }
  })

  it.each([
    { schemaVersion: 2 },
    { schemaVersion: '1' },
    { currency: 'EUR' },
    { billingCycle: 'rolling-month' },
    { effectiveDate: '2026-02-30' },
    { rules: {} },
    { rules: { monthlyFee: undefined } },
    { rules: { interest: { rateBps: 100 } } },
    { rules: { monthlyFee: { feeCents: 1200 } } },
    { rules: { transactionFee: { rateBps: 60 } } },
    { rules: { lateFee: { feeCents: 1500 } } },
    { rules: { monthlyFee: null } },
    { rules: { lateFee: { feeCents: 1500, graceDays: 1, unexpected: true } } },
    { rules: { transactionFee: { fixedCents: 0, rateBps: 100, unexpected: true } } },
    { rules: { monthlyFee: { feeCents: 1200, waiver: { kind: 'minTransactionCount', threshold: 5 }, unexpected: true } } },
    { unexpected: true },
  ])('rejects invalid contract structure %j', (overrides) => {
    expect(validateContract({ ...validContract(), ...overrides }).success).toBe(false)
  })

  it.each(['schemaVersion', 'id', 'name', 'version', 'currency', 'billingCycle', 'effectiveDate', 'rules'] as const)(
    'requires contract field %s',
    (field) => {
      const input: Partial<Contract> = validContract()
      delete input[field]
      expect(validateContract(input).success).toBe(false)
    },
  )

  it('does not compare the descriptive effectiveDate against scenario dates', () => {
    expect(validateContract({ ...validContract(), effectiveDate: '2099-01-01' }).success).toBe(true)
    expect(validateScenario(validScenario()).success).toBe(true)
  })
})

describe('Scenario v1 runtime validation', () => {
  it('accepts empty transaction and payment-event arrays', () => {
    expect(ScenarioSchema.safeParse({ ...validScenario(), transactions: [], paymentEvents: [] }).success).toBe(true)
  })

  it('accepts valid leap-day transactions in their billing month', () => {
    expect(validateScenario({
      ...validScenario(),
      billingMonth: '2024-02',
      transactions: [{ id: 'leap-purchase', occurredOn: '2024-02-29', amountCents: 1, kind: 'purchase' }],
    }).success).toBe(true)
  })

  it('accepts early payments and payment dates spanning months', () => {
    expect(validateScenario({
      ...validScenario(),
      paymentEvents: [{ id: 'early-payment', dueOn: '2026-06-02', paidOn: '2026-04-30', amountCents: 1 }],
    }).success).toBe(true)
    expect(validateScenario({
      ...validScenario(),
      paymentEvents: [{ id: 'cross-month-payment', dueOn: '2026-05-31', paidOn: '2026-06-02', amountCents: 1 }],
    }).success).toBe(true)
  })

  it.each([
    { schemaVersion: 2 },
    { schemaVersion: '1' },
    { billingMonth: '2026-13' },
    { transactions: null },
    { paymentEvents: {} },
    { transactions: [{ ...validTransaction(), kind: 'refund' }] },
    { transactions: [{ ...validTransaction(), occurredOn: '2026-02-30' }] },
    { transactions: [{ ...validTransaction(), occurredOn: '2026-06-01' }] },
    { transactions: [{ ...validTransaction(), id: ' ' }] },
    { transactions: [{ ...validTransaction(), unexpected: true }] },
    { paymentEvents: [{ ...validPaymentEvent(), paidOn: '2026-02-30' }] },
    { paymentEvents: [{ ...validPaymentEvent(), dueOn: '1900-02-29' }] },
    { paymentEvents: [{ ...validPaymentEvent(), id: '' }] },
    { paymentEvents: [{ ...validPaymentEvent(), unexpected: true }] },
    { unexpected: true },
  ])('rejects invalid scenario structure %j', (overrides) => {
    expect(validateScenario({ ...validScenario(), ...overrides }).success).toBe(false)
  })

  it.each(['schemaVersion', 'id', 'billingMonth', 'transactions', 'paymentEvents'] as const)(
    'requires scenario field %s',
    (field) => {
      const input: Partial<Scenario> = validScenario()
      delete input[field]
      expect(validateScenario(input).success).toBe(false)
    },
  )

  it.each(['id', 'occurredOn', 'amountCents', 'kind'] as const)(
    'requires transaction field %s',
    (field) => {
      const input: Partial<Scenario['transactions'][number]> = { ...validTransaction() }
      delete input[field]
      expect(TransactionSchema.safeParse(input).success).toBe(false)
    },
  )

  it.each(['id', 'dueOn', 'paidOn', 'amountCents'] as const)(
    'requires completed-payment field %s',
    (field) => {
      const input: Partial<Scenario['paymentEvents'][number]> = { ...validPaymentEvent() }
      delete input[field]
      expect(PaymentEventSchema.safeParse(input).success).toBe(false)
    },
  )

  it('rejects duplicate IDs in each array but allows the same ID across different arrays', () => {
    const scenario = validScenario()
    expect(validateScenario({ ...scenario, transactions: [...scenario.transactions, ...scenario.transactions] }).success).toBe(false)
    expect(validateScenario({ ...scenario, paymentEvents: [...scenario.paymentEvents, ...scenario.paymentEvents] }).success).toBe(false)
    expect(validateScenario({
      ...scenario,
      paymentEvents: [{ ...validPaymentEvent(), id: validTransaction().id }],
    }).success).toBe(true)
  })

  it('enforces the transaction array limit at 10,000 entries', () => {
    const scenario = validScenario()
    const transactions = Array.from({ length: 10001 }, (_, index) => ({
      ...validTransaction(), id: `purchase-${index}`,
    }))
    expect(validateScenario({ ...scenario, transactions: transactions.slice(0, 10000) }).success).toBe(true)
    expect(validateScenario({ ...scenario, transactions }).success).toBe(false)
  })

  it('enforces the payment-event array limit at 1,000 entries', () => {
    const scenario = validScenario()
    const paymentEvents = Array.from({ length: 1001 }, (_, index) => ({
      ...validPaymentEvent(), id: `payment-${index}`,
    }))
    expect(validateScenario({ ...scenario, paymentEvents: paymentEvents.slice(0, 1000) }).success).toBe(true)
    expect(validateScenario({ ...scenario, paymentEvents }).success).toBe(false)
  })

  it.each([
    ['transactions', 10000],
    ['paymentEvents', 1000],
  ] as const)('rejects oversized %s before reading any element', (field, limit) => {
    const oversized: unknown[] = new Array(limit + 1)
    Object.defineProperty(oversized, 0, {
      get() {
        throw new Error('Oversized array elements must not be visited')
      },
    })

    const result = validateScenario({ ...validScenario(), [field]: oversized })
    expect(result.success).toBe(false)
    if (result.success) throw new Error('Expected oversized scenario to fail validation')
    expect(result.issues).toContainEqual({
      path: [field],
      code: 'too_big',
      message: `Array must contain at most ${limit} entries.`,
    })
  })
})

describe('safe validation results', () => {
  it.each([undefined, null, true, 1, 'contract', [], () => undefined])(
    'safely rejects unknown non-object input %s',
    (input) => {
      expect(validateContract(input).success).toBe(false)
      expect(validateScenario(input).success).toBe(false)
    },
  )

  it('returns parsed data in successful results', () => {
    expect(validateContract(validContract())).toEqual({ success: true, data: validContract() })
    expect(validateScenario(validScenario())).toEqual({ success: true, data: validScenario() })
  })

  it('provides readable structured error paths for invalid nested fields', () => {
    const result = validateScenario({
      ...validScenario(),
      transactions: [{ ...validTransaction(), amountCents: -1 }],
    })
    expect(result.success).toBe(false)
    if (result.success) throw new Error('Expected invalid scenario to fail validation')
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues.some((issue) => issue.path.join('.') === 'transactions.0.amountCents')).toBe(true)
    for (const issue of result.issues) {
      expect(issue.code.length).toBeGreaterThan(0)
      expect(issue.message.trim().length).toBeGreaterThan(0)
      expect(issue.path.every((part) => typeof part === 'string' || typeof part === 'number')).toBe(true)
    }
  })

  it('provides structured issue paths for invalid contract rule amounts', () => {
    const result = validateContract({
      ...validContract(),
      rules: { transactionFee: { fixedCents: -1, rateBps: 100 } },
    })
    expect(result.success).toBe(false)
    if (result.success) throw new Error('Expected invalid contract to fail validation')
    expect(result.issues.some((issue) => issue.path.join('.') === 'rules.transactionFee.fixedCents')).toBe(true)
    expect(result.issues.every((issue) => issue.code.length > 0 && issue.message.trim().length > 0)).toBe(true)
  })

  it('identifies duplicate IDs and billing-month mismatch at their offending entries', () => {
    const scenario = validScenario()
    const duplicate = validateScenario({ ...scenario, transactions: [...scenario.transactions, ...scenario.transactions] })
    const wrongMonth = validateScenario({
      ...scenario,
      transactions: [{ ...validTransaction(), occurredOn: '2026-06-01' }],
    })
    expect(duplicate.success).toBe(false)
    expect(wrongMonth.success).toBe(false)
    if (duplicate.success || wrongMonth.success) throw new Error('Expected invalid scenarios to fail validation')
    expect(duplicate.issues.some((issue) => issue.path.join('.') === 'transactions.1.id')).toBe(true)
    expect(wrongMonth.issues.some((issue) => issue.path.join('.') === 'transactions.0.occurredOn')).toBe(true)
  })

  it('round-trips both models through JSON without changing validated values', () => {
    const contract = validContract()
    const scenario = validScenario()
    expect(validateContract(JSON.parse(JSON.stringify(contract)))).toEqual(validateContract(contract))
    expect(validateScenario(JSON.parse(JSON.stringify(scenario)))).toEqual(validateScenario(scenario))
  })

  it('returns deterministic results without mutating successful or rejected inputs', () => {
    const contract = validContract()
    const scenario = validScenario()
    const invalid = { ...scenario, transactions: [{ ...validTransaction(), amountCents: -1 }] }
    const before = JSON.stringify({ contract, scenario, invalid })
    for (let count = 0; count < 3; count += 1) {
      expect(validateContract(contract)).toEqual(validateContract(contract))
      expect(validateScenario(scenario)).toEqual(validateScenario(scenario))
      expect(validateScenario(invalid)).toEqual(validateScenario(invalid))
    }
    expect(JSON.stringify({ contract, scenario, invalid })).toBe(before)
  })
})
