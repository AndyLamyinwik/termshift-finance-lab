import { describe, expect, it } from 'vitest'
import { validateContract, validateScenario } from '../models'
import {
  experiments,
  gracePeriodShiftExperiment,
  microtransactionPenaltyExperiment,
  waiverTrapExperiment,
} from './index'
import type { ExperimentFixture } from './index'

describe.each(experiments)('$name synthetic fixture', (experiment) => {
  it.each([
    ['old', experiment.oldContract],
    ['new', experiment.newContract],
  ])('validates the %s contract with the public runtime validator', (_, contract) => {
    expect(validateContract(contract)).toEqual({ success: true, data: contract })
  })

  it('validates the scenario with the public runtime validator', () => {
    expect(validateScenario(experiment.scenario)).toEqual({
      success: true,
      data: experiment.scenario,
    })
  })

  it('preserves every model through JSON serialization and runtime validation', () => {
    const restored: ExperimentFixture = JSON.parse(JSON.stringify(experiment))

    expect(restored).toEqual(experiment)
    expect(validateContract(restored.oldContract)).toEqual({
      success: true,
      data: restored.oldContract,
    })
    expect(validateContract(restored.newContract)).toEqual({
      success: true,
      data: restored.newContract,
    })
    expect(validateScenario(restored.scenario)).toEqual({
      success: true,
      data: restored.scenario,
    })
  })
})

describe('requested synthetic experiment inputs', () => {
  it('models The Waiver Trap without calculating an outcome', () => {
    const { oldContract, newContract, scenario } = waiverTrapExperiment

    expect(oldContract.rules).toEqual({
      monthlyFee: {
        feeCents: 1200,
        waiver: { kind: 'minTransactionCount', threshold: 5 },
      },
    })
    expect(newContract.rules).toEqual({
      monthlyFee: {
        feeCents: 1200,
        waiver: { kind: 'minPurchaseTotalCents', threshold: 50000 },
      },
    })
    expect(scenario.transactions).toHaveLength(5)
    expect(scenario.transactions.every((transaction) => transaction.amountCents === 1000)).toBe(true)
    expect(scenario.paymentEvents).toEqual([])
  })

  it('models The Microtransaction Penalty without calculating an outcome', () => {
    const { oldContract, newContract, scenario } = microtransactionPenaltyExperiment

    expect(oldContract.rules).toEqual({ transactionFee: { fixedCents: 0, rateBps: 100 } })
    expect(newContract.rules).toEqual({ transactionFee: { fixedCents: 20, rateBps: 60 } })
    expect(scenario.transactions).toHaveLength(10)
    expect(scenario.transactions.every((transaction) => transaction.amountCents === 100)).toBe(true)
    expect(scenario.paymentEvents).toEqual([])
  })

  it('models The Grace Period Shift with a completed fictional payment', () => {
    const { oldContract, newContract, scenario } = gracePeriodShiftExperiment

    expect(oldContract.rules).toEqual({ lateFee: { feeCents: 1500, graceDays: 3 } })
    expect(newContract.rules).toEqual({ lateFee: { feeCents: 1500, graceDays: 1 } })
    expect(scenario.transactions).toEqual([])
    expect(scenario.paymentEvents).toEqual([
      {
        id: 'grace-payment-1',
        dueOn: '2026-05-15',
        paidOn: '2026-05-17',
        amountCents: 10000,
      },
    ])
    expect(gracePeriodShiftExperiment.description).toContain('arbitrary fictional fixture value')
  })
})
