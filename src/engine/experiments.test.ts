import { describe, expect, it } from 'vitest'
import {
  experiments,
  gracePeriodShiftExperiment,
  microtransactionPenaltyExperiment,
  waiverTrapExperiment,
} from '../scenarios'
import { compareContracts, evaluateContract } from './index'

describe('Stage 2 formal fixtures evaluated by the Stage 3 engine', () => {
  it.each([
    { fixture: waiverTrapExperiment, category: 'monthlyFeeCents', old: 0, next: 1200, delta: 1200 },
    { fixture: microtransactionPenaltyExperiment, category: 'transactionFeeCents', old: 10, next: 210, delta: 200 },
    { fixture: gracePeriodShiftExperiment, category: 'lateFeeCents', old: 0, next: 1500, delta: 1500 },
  ] as const)('$fixture.name: old $old / new $next / delta $delta cents', ({ fixture, category, old, next, delta }) => {
    const oldResult = evaluateContract(fixture.oldContract, fixture.scenario)
    const newResult = evaluateContract(fixture.newContract, fixture.scenario)
    const result = compareContracts(fixture.oldContract, fixture.newContract, fixture.scenario)

    expect(oldResult.success).toBe(true)
    expect(newResult.success).toBe(true)
    expect(result.success).toBe(true)
    if (!oldResult.success || !newResult.success || !result.success) {
      throw new Error('A formal fixture failed engine evaluation.')
    }
    expect(oldResult.data[category]).toBe(old)
    expect(newResult.data[category]).toBe(next)
    expect(oldResult.data.totalCents).toBe(old)
    expect(newResult.data.totalCents).toBe(next)
    expect(result.data.oldEvaluation).toEqual(oldResult.data)
    expect(result.data.newEvaluation).toEqual(newResult.data)
    expect(result.data.deltaCents).toBe(delta)
    expect(result.data.deltaByCategoryCents[category]).toBe(delta)
    expect(Object.values(result.data.deltaByCategoryCents).reduce((sum, amount) => sum + amount, 0)).toBe(delta)
  })

  it('explains both waiver outcomes using observed count and total rather than preset results', () => {
    const { oldContract, newContract, scenario } = waiverTrapExperiment
    const result = compareContracts(oldContract, newContract, scenario)
    expect(result.success).toBe(true)
    if (!result.success) throw new Error('Waiver fixture failed engine evaluation.')

    expect(result.data.oldEvaluation.trace).toEqual([{
      ruleType: 'monthlyFee',
      originalFeeCents: 1200,
      waiverKind: 'minTransactionCount',
      threshold: 5,
      actualTransactionCount: 5,
      waived: true,
      chargedCents: 0,
    }])
    expect(result.data.newEvaluation.trace).toEqual([{
      ruleType: 'monthlyFee',
      originalFeeCents: 1200,
      waiverKind: 'minPurchaseTotalCents',
      threshold: 50000,
      actualPurchaseTotalCents: 5000,
      waived: false,
      chargedCents: 1200,
    }])
  })

  it('explains ten individually rounded transaction charges for the microtransaction fixture', () => {
    const { oldContract, newContract, scenario } = microtransactionPenaltyExperiment
    const result = compareContracts(oldContract, newContract, scenario)
    expect(result.success).toBe(true)
    if (!result.success) throw new Error('Microtransaction fixture failed engine evaluation.')

    expect(result.data.oldEvaluation.trace).toHaveLength(10)
    expect(result.data.newEvaluation.trace).toHaveLength(10)
    scenario.transactions.forEach((transaction, index) => {
      expect(result.data.oldEvaluation.trace[index]).toEqual({
        ruleType: 'transactionFee',
        transactionId: transaction.id,
        amountCents: 100,
        fixedCents: 0,
        rateBps: 100,
        variableFeeCents: 1,
        chargedCents: 1,
      })
      expect(result.data.newEvaluation.trace[index]).toEqual({
        ruleType: 'transactionFee',
        transactionId: transaction.id,
        amountCents: 100,
        fixedCents: 20,
        rateBps: 60,
        variableFeeCents: 1,
        chargedCents: 21,
      })
    })
  })

  it('explains the same two late days against both grace periods', () => {
    const { oldContract, newContract, scenario } = gracePeriodShiftExperiment
    const result = compareContracts(oldContract, newContract, scenario)
    expect(result.success).toBe(true)
    if (!result.success) throw new Error('Grace period fixture failed engine evaluation.')

    expect(result.data.oldEvaluation.trace[0]).toMatchObject({
      ruleType: 'lateFee',
      paymentEventId: 'grace-payment-1',
      dueOn: '2026-05-15',
      paidOn: '2026-05-17',
      originalFeeCents: 1500,
      lateDays: 2,
      graceDays: 3,
      graceExceeded: false,
      chargedCents: 0,
    })
    expect(result.data.newEvaluation.trace[0]).toMatchObject({
      ruleType: 'lateFee',
      lateDays: 2,
      graceDays: 1,
      graceExceeded: true,
      chargedCents: 1500,
    })
  })

  it.each(experiments)('$name has deterministic, JSON-safe traces whose charges sum to its total', (fixture) => {
    const first = compareContracts(fixture.oldContract, fixture.newContract, fixture.scenario)
    const repeat = compareContracts(fixture.oldContract, fixture.newContract, fixture.scenario)
    expect(repeat).toEqual(first)
    expect(JSON.parse(JSON.stringify(first))).toEqual(first)
    expect(first.success).toBe(true)
    if (!first.success) throw new Error('Formal fixture failed comparison.')

    for (const evaluation of [first.data.oldEvaluation, first.data.newEvaluation]) {
      expect(evaluation.trace.reduce((sum, entry) => sum + entry.chargedCents, 0)).toBe(evaluation.totalCents)
      expect(Number.isSafeInteger(evaluation.totalCents)).toBe(true)
    }
    expect(Object.values(first.data.deltaByCategoryCents).reduce((sum, amount) => sum + amount, 0)).toBe(first.data.deltaCents)
  })
})
