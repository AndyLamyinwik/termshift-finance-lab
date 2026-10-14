import { describe, expect, it } from 'vitest'
import { validateContract } from '../../models'
import type { Contract } from '../../models'
import {
  experiments,
  gracePeriodShiftExperiment,
  microtransactionPenaltyExperiment,
  waiverTrapExperiment,
} from '../../scenarios'
import {
  contractToDraft,
  formatCentsForInput,
  parseContractDraft,
  parseIntegerInput,
  parseUsdToCents,
} from './drafts'
import type { DraftResult } from './drafts'

function unwrap<T>(result: DraftResult<T>): T {
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

describe('exact USD input conversion', () => {
  it.each([
    ['0', 0], ['12', 1200], ['12.5', 1250], ['12.50', 1250],
    ['500.00', 50000], ['0.01', 1], ['0.29', 29],
    ['90071992547409.91', Number.MAX_SAFE_INTEGER],
  ])('converts %s exactly to %s integer cents', (input, cents) => {
    expect(parseUsdToCents(input)).toEqual({ success: true, data: cents })
  })

  it.each([
    '', ' ', ' 12', '12 ', '\t12', '12\n', '12\r\n', '-1', '+1',
    '1.001', '1e2', '1E2', 'NaN', 'Infinity', '0x10', '1,000',
    '00', '012', '00.50', '.50', '12.', '1.2.3', '１２', '1_000',
    '90071992547409.92', '90071992547410', '9'.repeat(100000),
  ])('rejects malformed or unsafe USD text %j without correcting it', (input) => {
    const result = parseUsdToCents(input)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.issues[0]?.path).toEqual([])
      expect(result.issues[0]?.message.length).toBeGreaterThan(0)
    }
  })

  it('requires text and rejects non-finite numbers without coercion', () => {
    for (const input of [NaN, Infinity, -Infinity, 12.50, null, undefined, {}, ['12.50']]) {
      expect(parseUsdToCents(input).success).toBe(false)
    }
  })

  it('formats cents for editing and round-trips the full safe-integer limit', () => {
    for (const cents of [0, 1, 29, 1250, 50000, Number.MAX_SAFE_INTEGER]) {
      const text = formatCentsForInput(cents)
      expect(text).toMatch(/^(0|[1-9][0-9]*)\.[0-9]{2}$/)
      expect(parseUsdToCents(text)).toEqual({ success: true, data: cents })
    }
    expect(formatCentsForInput(Number.MAX_SAFE_INTEGER)).toBe('90071992547409.91')
  })

  it('rejects unsafe, fractional, negative and non-finite cents for editing', () => {
    for (const cents of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, -Infinity]) {
      expect(() => formatCentsForInput(cents)).toThrow(RangeError)
    }
  })
})

describe('bounded integer input', () => {
  it('accepts exact bounds and rejects values outside field-specific ranges', () => {
    expect(parseIntegerInput('0')).toEqual({ success: true, data: 0 })
    expect(parseIntegerInput(String(Number.MAX_SAFE_INTEGER))).toEqual({ success: true, data: Number.MAX_SAFE_INTEGER })
    expect(parseIntegerInput('1', 1)).toEqual({ success: true, data: 1 })
    expect(parseIntegerInput('10000', 0, 10000)).toEqual({ success: true, data: 10000 })
    expect(parseIntegerInput('0', 1).success).toBe(false)
    expect(parseIntegerInput('10001', 0, 10000).success).toBe(false)
    expect(parseIntegerInput('9007199254740992').success).toBe(false)
  })

  it('rejects non-canonical integer formats rather than parsing a numeric prefix', () => {
    for (const input of ['', ' ', '1 ', '1\n', '01', '-1', '+1', '1.0', '1.5', '1e2', '0x10', 'NaN', 'Infinity', '1,000', '9'.repeat(100000), 1, null]) {
      expect(parseIntegerInput(input).success).toBe(false)
    }
  })

  it('rejects invalid API bounds with structured issues', () => {
    for (const [min, max] of [[-1, 10], [2, 1], [0.5, 10], [0, Infinity]]) {
      const result = parseIntegerInput('1', min, max)
      expect(result).toMatchObject({ success: false, issues: [{ code: 'invalid_integer_bounds' }] })
    }
  })
})

describe('formal contract draft validation', () => {
  it.each(experiments)('round-trips both formal $name contracts without changing metadata or rules', (experiment) => {
    for (const contract of [experiment.oldContract, experiment.newContract]) {
      const draft = contractToDraft(contract)
      const parsed = unwrap(parseContractDraft(contract, draft))
      expect(parsed).toEqual(contract)
      expect(parsed).not.toBe(contract)
      expect(parsed.rules).not.toBe(contract.rules)
      expect(validateContract(parsed).success).toBe(true)
    }
  })

  it('edits exact monthly cents and permits both supported waiver kinds', () => {
    const base = waiverTrapExperiment.newContract
    const changed = unwrap(parseContractDraft(base, {
      monthlyFee: { feeUsd: '12.50', waiverKind: 'minPurchaseTotalCents', threshold: '50.29' },
    }))
    expect(changed.rules.monthlyFee).toEqual({
      feeCents: 1250,
      waiver: { kind: 'minPurchaseTotalCents', threshold: 5029 },
    })
    const switched = unwrap(parseContractDraft(base, {
      monthlyFee: { feeUsd: '0', waiverKind: 'minTransactionCount', threshold: '5' },
    }))
    expect(switched.rules.monthlyFee).toEqual({
      feeCents: 0,
      waiver: { kind: 'minTransactionCount', threshold: 5 },
    })
  })

  it('edits exact transaction fee cents and integer basis points', () => {
    const changed = unwrap(parseContractDraft(microtransactionPenaltyExperiment.newContract, {
      transactionFee: { fixedUsd: '0.29', rateBps: '10000' },
    }))
    expect(changed.rules.transactionFee).toEqual({ fixedCents: 29, rateBps: 10000 })
  })

  it('edits late fee and accepts zero grace days and maximum safe integers', () => {
    const changed = unwrap(parseContractDraft(gracePeriodShiftExperiment.newContract, {
      lateFee: { feeUsd: '90071992547409.91', graceDays: '9007199254740991' },
    }))
    expect(changed.rules.lateFee).toEqual({ feeCents: Number.MAX_SAFE_INTEGER, graceDays: Number.MAX_SAFE_INTEGER })
    expect(unwrap(parseContractDraft(changed, { lateFee: { feeUsd: '0', graceDays: '0' } })).rules.lateFee)
      .toEqual({ feeCents: 0, graceDays: 0 })
  })

  it('requires positive waiver thresholds in the selected unit', () => {
    for (const [waiverKind, threshold] of [
      ['minTransactionCount', '0'], ['minTransactionCount', '1.5'],
      ['minPurchaseTotalCents', '0'], ['minPurchaseTotalCents', '0.001'],
    ]) {
      const result = parseContractDraft(waiverTrapExperiment.newContract, {
        monthlyFee: { feeUsd: '12.00', waiverKind, threshold },
      })
      expect(result).toMatchObject({ success: false, issues: [{ path: ['monthlyFee', 'threshold'] }] })
    }
  })

  it('reports all numeric field failures with exact editor field paths', () => {
    const base: Contract = {
      ...waiverTrapExperiment.newContract,
      rules: {
        monthlyFee: waiverTrapExperiment.newContract.rules.monthlyFee,
        transactionFee: { fixedCents: 0, rateBps: 0 },
        lateFee: { feeCents: 0, graceDays: 0 },
      },
    }
    const result = parseContractDraft(base, {
      monthlyFee: { feeUsd: '', waiverKind: 'minTransactionCount', threshold: '0' },
      transactionFee: { fixedUsd: '-0.10', rateBps: '10001' },
      lateFee: { feeUsd: 'Infinity', graceDays: '2.5' },
    })
    expect(result.success).toBe(false)
    if (result.success) throw new Error('Expected field errors')
    expect(result.issues.map((issue) => issue.path)).toEqual([
      ['monthlyFee', 'feeUsd'], ['monthlyFee', 'threshold'],
      ['transactionFee', 'fixedUsd'], ['transactionFee', 'rateBps'],
      ['lateFee', 'feeUsd'], ['lateFee', 'graceDays'],
    ])
    expect(result.issues.every((issue) => issue.message.length > 0)).toBe(true)
  })

  it('rejects missing fields, numeric values and unknown waiver kinds', () => {
    for (const monthlyFee of [
      { waiverKind: 'minTransactionCount', threshold: '5' },
      { feeUsd: 12, waiverKind: 'minTransactionCount', threshold: '5' },
      { feeUsd: '12', waiverKind: 'unknown-waiver', threshold: '5' },
    ]) {
      expect(parseContractDraft(waiverTrapExperiment.oldContract, { monthlyFee }).success).toBe(false)
    }
  })

  it('uses strict draft objects at the root and inside every rule', () => {
    const cases = [
      [waiverTrapExperiment.oldContract, { ...contractToDraft(waiverTrapExperiment.oldContract), currency: 'EUR' }],
      [waiverTrapExperiment.oldContract, { monthlyFee: { feeUsd: '12', waiverKind: 'minTransactionCount', threshold: '5', extra: true } }],
      [microtransactionPenaltyExperiment.newContract, { transactionFee: { fixedUsd: '0.20', rateBps: '60', extra: true } }],
      [gracePeriodShiftExperiment.newContract, { lateFee: { feeUsd: '15', graceDays: '1', extra: true } }],
    ]
    for (const [base, draft] of cases) {
      expect(parseContractDraft(base, draft)).toMatchObject({ success: false, issues: [{ code: 'unrecognized_keys' }] })
    }
  })

  it('rejects removing an existing rule or adding a rule category', () => {
    expect(parseContractDraft(waiverTrapExperiment.oldContract, {})).toMatchObject({
      success: false, issues: [{ code: 'rule_set_changed', path: ['monthlyFee'] }],
    })
    expect(parseContractDraft(waiverTrapExperiment.oldContract, {
      ...contractToDraft(waiverTrapExperiment.oldContract),
      transactionFee: { fixedUsd: '0', rateBps: '0' },
    })).toMatchObject({
      success: false, issues: [{ code: 'rule_set_changed', path: ['transactionFee'] }],
    })
  })

  it('formally validates the base contract rather than trusting caller types', () => {
    for (const base of [undefined, null, {}, { ...waiverTrapExperiment.oldContract, currency: 'EUR' }]) {
      const result = parseContractDraft(base, contractToDraft(waiverTrapExperiment.oldContract))
      expect(result.success).toBe(false)
      if (!result.success) expect(result.issues.every((issue) => issue.path[0] === 'baseContract')).toBe(true)
    }
  })

  it('rejects unknown draft input types safely', () => {
    for (const draft of [undefined, null, [], '12', 12]) {
      expect(parseContractDraft(waiverTrapExperiment.oldContract, draft).success).toBe(false)
    }
  })

  it('preserves metadata and frozen fixtures, returns independent working objects and is deterministic', () => {
    const fixtures = freezeDeep(structuredClone(experiments))
    const before = JSON.stringify(fixtures)
    const base = fixtures[0].newContract
    const draft = freezeDeep({ monthlyFee: { feeUsd: '0.29', waiverKind: 'minPurchaseTotalCents', threshold: '50.00' } })
    const first = parseContractDraft(base, draft)
    const second = parseContractDraft(base, draft)
    expect(first).toEqual(second)
    const applied = unwrap(first)
    const { rules: appliedRules, ...appliedMetadata } = applied
    const { rules: baseRules, ...baseMetadata } = base
    expect(appliedMetadata).toEqual(baseMetadata)
    expect(appliedRules).not.toBe(baseRules)
    expect(appliedRules.monthlyFee?.waiver).not.toBe(baseRules.monthlyFee.waiver)
    if (appliedRules.monthlyFee) appliedRules.monthlyFee.feeCents = 99
    expect(JSON.stringify(fixtures)).toBe(before)
    expect(base.rules.monthlyFee.feeCents).toBe(1200)
    expect(draft.monthlyFee.feeUsd).toBe('0.29')
  })
})
