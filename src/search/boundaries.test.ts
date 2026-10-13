import { describe, expect, it } from 'vitest'
import { compareContracts } from '../engine'
import { validateScenario } from '../models'
import type { Contract, FinancialRules, Scenario } from '../models'
import {
  gracePeriodShiftExperiment,
  microtransactionPenaltyExperiment,
  waiverTrapExperiment,
} from '../scenarios/experiments'
import { boundaryParameters, MAX_BOUNDARY_CANDIDATES } from './boundaries'
import { generateCandidateScenario } from './generator'
import type { SearchOptions } from './types'

const options: SearchOptions = {
  seed: 0,
  maxEvaluations: 500,
  maxResults: 10,
  purchaseCountMin: 0,
  purchaseCountMax: 30,
  purchaseAmountCentsMin: 1,
  purchaseAmountCentsMax: 100000,
  lateDaysMin: 0,
  lateDaysMax: 31,
}

const base: Scenario = {
  ...gracePeriodShiftExperiment.scenario,
  transactions: [],
  paymentEvents: gracePeriodShiftExperiment.scenario.paymentEvents.map((payment) => ({
    ...payment, paidOn: payment.dueOn,
  })),
}

function contract(rules: FinancialRules): Contract {
  return { ...waiverTrapExperiment.oldContract, rules }
}

describe('contract-derived boundary candidates', () => {
  it('derives both sides of arbitrary count-waiver thresholds', () => {
    const candidates = [...boundaryParameters(
      contract({ monthlyFee: { feeCents: 700, waiver: { kind: 'minTransactionCount', threshold: 7 } } }),
      contract({ monthlyFee: { feeCents: 700, waiver: { kind: 'minTransactionCount', threshold: 11 } } }),
      base,
      options,
    )]
    const counts = new Set(candidates.map((candidate) => candidate.purchaseCount))
    for (const thresholdNeighbor of [6, 7, 8, 10, 11, 12]) {
      expect(counts.has(thresholdNeighbor)).toBe(true)
    }
    expect(candidates[0]).toEqual({ purchaseCount: 6, purchaseAmountCents: 1, lateDays: 0 })
  })

  it('derives floor/ceil total-waiver boundaries for uniform purchase amounts', () => {
    const rules: FinancialRules = {
      monthlyFee: { feeCents: 700, waiver: { kind: 'minPurchaseTotalCents', threshold: 101 } },
    }
    const candidates = [...boundaryParameters(contract(rules), contract(rules), base, {
      ...options,
      purchaseCountMin: 3,
      purchaseCountMax: 3,
      purchaseAmountCentsMin: 31,
      purchaseAmountCentsMax: 37,
    })]
    const amounts = new Set(candidates.map((candidate) => candidate.purchaseAmountCents))
    for (const thresholdNeighbor of [32, 33, 34, 35]) {
      expect(amounts.has(thresholdNeighbor)).toBe(true)
    }
    expect(candidates.every((candidate) => candidate.purchaseCount === 3)).toBe(true)
  })

  it('changes total-waiver boundaries when the actual threshold changes', () => {
    const rules = (threshold: number): FinancialRules => ({
      monthlyFee: { feeCents: 700, waiver: { kind: 'minPurchaseTotalCents', threshold } },
    })
    const range = { ...options, purchaseCountMin: 3, purchaseCountMax: 3 }
    const first = [...boundaryParameters(contract(rules(101)), contract(rules(101)), base, range)]
    const second = [...boundaryParameters(contract(rules(202)), contract(rules(202)), base, range)]
    expect(first).not.toEqual(second)
    const amounts = new Set(second.map((candidate) => candidate.purchaseAmountCents))
    expect([66, 67, 68, 69].every((amount) => amounts.has(amount))).toBe(true)
  })

  it('derives an integer transaction-fee crossover from fixed fees and rates', () => {
    const candidates = [...boundaryParameters(
      contract({ transactionFee: { fixedCents: 0, rateBps: 120 } }),
      contract({ transactionFee: { fixedCents: 9, rateBps: 90 } }),
      base,
      options,
    )]
    const amounts = new Set(candidates.map((candidate) => candidate.purchaseAmountCents))
    expect([2999, 3000, 3001].every((amount) => amounts.has(amount))).toBe(true)
  })

  it('derives both floor and ceil neighbors for a fractional crossover', () => {
    const candidates = [...boundaryParameters(
      contract({ transactionFee: { fixedCents: 7, rateBps: 37 } }),
      contract({ transactionFee: { fixedCents: 0, rateBps: 43 } }),
      base,
      options,
    )]
    const amounts = new Set(candidates.map((candidate) => candidate.purchaseAmountCents))
    expect([11665, 11666, 11667, 11668].every((amount) => amounts.has(amount))).toBe(true)
  })

  it('derives half-cent transitions from the contracts actual basis points', () => {
    const candidates = [...boundaryParameters(
      contract({ transactionFee: { fixedCents: 0, rateBps: 400 } }),
      contract({ transactionFee: { fixedCents: 0, rateBps: 250 } }),
      base,
      { ...options, purchaseAmountCentsMax: 30 },
    )]
    const amounts = new Set(candidates.map((candidate) => candidate.purchaseAmountCents))
    expect([12, 13, 14, 19, 20, 21].every((amount) => amounts.has(amount))).toBe(true)
  })

  it('handles zero rates and parallel fee lines without dividing by zero', () => {
    const oldContract = contract({ transactionFee: { fixedCents: 3, rateBps: 0 } })
    const newContract = contract({ transactionFee: { fixedCents: 9, rateBps: 0 } })
    const candidates = [...boundaryParameters(oldContract, newContract, base, options)]
    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates.every((candidate) => Number.isSafeInteger(candidate.purchaseAmountCents))).toBe(true)
  })

  it('derives arbitrary grace-day neighbors when existing payments are present', () => {
    const candidates = [...boundaryParameters(
      contract({ lateFee: { feeCents: 900, graceDays: 6 } }),
      contract({ lateFee: { feeCents: 900, graceDays: 11 } }),
      base,
      options,
    )]
    const delays = new Set(candidates.map((candidate) => candidate.lateDays))
    expect([5, 6, 7, 10, 11, 12].every((delay) => delays.has(delay))).toBe(true)
  })

  it('does not explore grace-rule boundaries when there are no payment obligations', () => {
    const oldContract = contract({ lateFee: { feeCents: 900, graceDays: 6 } })
    const newContract = contract({ lateFee: { feeCents: 900, graceDays: 11 } })
    const candidates = [...boundaryParameters(oldContract, newContract, { ...base, paymentEvents: [] }, options)]
    expect(candidates.every((candidate) => candidate.lateDays === 0 || candidate.lateDays === 31)).toBe(true)
  })

  it('includes both cost directions around the formal transaction experiment', () => {
    const { oldContract, newContract } = microtransactionPenaltyExperiment
    const candidates = [...boundaryParameters(oldContract, newContract, { ...base, paymentEvents: [] }, options)]
    const deltas = candidates.map((parameters, index) => {
      const generated = generateCandidateScenario(base, parameters, `boundary-${index}`)
      if (!generated.success) throw new Error(JSON.stringify(generated.issues))
      const comparison = compareContracts(oldContract, newContract, generated.scenario)
      if (!comparison.success) throw new Error(JSON.stringify(comparison.issues))
      return comparison.data.deltaCents
    })
    expect(deltas.some((delta) => delta > 0)).toBe(true)
    expect(deltas.some((delta) => delta < 0)).toBe(true)
  })
})

describe('bounded deterministic boundary generation', () => {
  it('filters out-of-range thresholds instead of extending or clamping ranges', () => {
    const oldContract = contract({
      monthlyFee: { feeCents: 700, waiver: { kind: 'minTransactionCount', threshold: 25 } },
      transactionFee: { fixedCents: 0, rateBps: 120 },
      lateFee: { feeCents: 900, graceDays: 6 },
    })
    const newContract = contract({
      monthlyFee: { feeCents: 700, waiver: { kind: 'minPurchaseTotalCents', threshold: 101 } },
      transactionFee: { fixedCents: 9, rateBps: 90 },
      lateFee: { feeCents: 900, graceDays: 11 },
    })
    const candidates = [...boundaryParameters(oldContract, newContract, base, {
      ...options,
      purchaseCountMin: 23,
      purchaseCountMax: 23,
      purchaseAmountCentsMin: 200,
      purchaseAmountCentsMax: 220,
      lateDaysMin: 27,
      lateDaysMax: 27,
    })]
    expect(candidates).toEqual(expect.arrayContaining([
      { purchaseCount: 23, purchaseAmountCents: 200, lateDays: 27 },
      { purchaseCount: 23, purchaseAmountCents: 220, lateDays: 27 },
    ]))
    expect(candidates.every((candidate) => candidate.purchaseCount === 23
      && candidate.purchaseAmountCents >= 200 && candidate.purchaseAmountCents <= 220
      && candidate.lateDays === 27)).toBe(true)
  })

  it('handles safe-integer maximum rule thresholds without numeric wraparound', () => {
    const extreme = contract({
      monthlyFee: { feeCents: 0, waiver: { kind: 'minTransactionCount', threshold: Number.MAX_SAFE_INTEGER } },
      transactionFee: { fixedCents: Number.MAX_SAFE_INTEGER, rateBps: 1 },
      lateFee: { feeCents: 0, graceDays: Number.MAX_SAFE_INTEGER },
    })
    const candidates = [...boundaryParameters(extreme, extreme, base, options)]
    expect(candidates.every((candidate) => candidate.purchaseCount <= 30 && candidate.lateDays <= 31)).toBe(true)
    expect(candidates.length).toBeLessThanOrEqual(MAX_BOUNDARY_CANDIDATES)
  })

  it('is finite, unique, reproducible, and range-bounded at the widest allowed ranges', () => {
    const oldContract = contract({
      monthlyFee: { feeCents: 700, waiver: { kind: 'minPurchaseTotalCents', threshold: 987654 } },
      transactionFee: { fixedCents: 13, rateBps: 157 },
      lateFee: { feeCents: 900, graceDays: 7 },
    })
    const newContract = contract({
      monthlyFee: { feeCents: 700, waiver: { kind: 'minPurchaseTotalCents', threshold: 765432 } },
      transactionFee: { fixedCents: 37, rateBps: 121 },
      lateFee: { feeCents: 900, graceDays: 19 },
    })
    const candidates = [...boundaryParameters(oldContract, newContract, base, options)]
    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates.length).toBeLessThanOrEqual(MAX_BOUNDARY_CANDIDATES)
    expect(new Set(candidates.map((candidate) => JSON.stringify(candidate))).size).toBe(candidates.length)
    expect([...boundaryParameters(oldContract, newContract, base, options)]).toEqual(candidates)
    for (const [index, candidate] of candidates.entries()) {
      expect(candidate.purchaseCount).toBeGreaterThanOrEqual(0)
      expect(candidate.purchaseCount).toBeLessThanOrEqual(30)
      expect(candidate.purchaseAmountCents).toBeGreaterThanOrEqual(1)
      expect(candidate.purchaseAmountCents).toBeLessThanOrEqual(100000)
      expect(candidate.lateDays).toBeGreaterThanOrEqual(0)
      expect(candidate.lateDays).toBeLessThanOrEqual(31)
      const generated = generateCandidateScenario(base, candidate, `validated-${index}`)
      if (!generated.success) throw new Error(JSON.stringify(generated.issues))
      expect(validateScenario(generated.scenario).success).toBe(true)
    }
  })

  it('preserves all contracts, scenarios, and search options', () => {
    const oldContract = structuredClone(waiverTrapExperiment.oldContract)
    const newContract = structuredClone(waiverTrapExperiment.newContract)
    const scenario = structuredClone(base)
    const settings = { ...options }
    const snapshot = JSON.stringify({ oldContract, newContract, scenario, settings })
    const candidates = [...boundaryParameters(oldContract, newContract, scenario, settings)]
    expect(candidates.length).toBeGreaterThan(0)
    expect(JSON.stringify({ oldContract, newContract, scenario, settings })).toBe(snapshot)
  })
})
