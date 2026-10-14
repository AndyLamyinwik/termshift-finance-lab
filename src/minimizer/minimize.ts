import { compareContracts } from '../engine'
import { calendarDaysBetween } from '../engine/dates'
import { ContractSchema } from '../models'
import type { Scenario } from '../models'
import { SearchOptionsSchema } from '../search'
import { compareObjectives, invariantIssues, rangeIssues, sameData, scenarioObjective } from './invariants'
import { MinimizationOptionsSchema, SearchScenarioSchema, WitnessSchema } from './schemas'
import type { EvidenceResult, MinimizationIssue, MinimizationResult, ReductionStep } from './types'
import type { z } from 'zod'

function validationIssues(error: z.ZodError, prefix: string): MinimizationIssue[] {
  return error.issues.map((issue) => ({
    code: 'validation_error', path: [prefix, ...issue.path.map((part) => typeof part === 'number' ? part : String(part))],
    message: issue.message, validationCode: issue.code,
  }))
}

/**
 * Ascending finite probes. Small intervals are exhaustive; large intervals
 * sample their lower edge, dyadic interior, and upper edge independently.
 * A failed amount is never treated as evidence that other amounts will fail.
 */
function smallerAmounts(min: number, current: number): number[] {
  const values = new Set<number>()
  if (current - min <= 32) {
    for (let value = min; value < current; value += 1) values.add(value)
  } else {
    for (let offset = 0; offset < 8; offset += 1) {
      values.add(min + offset)
      values.add(current - 1 - offset)
    }
    for (const denominator of [2, 4, 8, 16]) {
      for (let numerator = 1; numerator < denominator; numerator += 2) {
        values.add(min + Math.floor((current - min) * numerator / denominator))
      }
    }
  }
  return [...values].filter((value) => value >= min && value < current).sort((a, b) => a - b)
}

/** At most 31 civil days; never constructs a timestamp or uses a time zone. */
function dateAtDelay(date: string, delay: number): string | undefined {
  let year = Number(date.slice(0, 4))
  let month = Number(date.slice(5, 7))
  let day = Number(date.slice(8, 10))
  for (let count = 0; count < delay; count += 1) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
    const length = month === 2 ? (leap ? 29 : 28) : ([4, 6, 9, 11].includes(month) ? 30 : 31)
    day += 1
    if (day > length) {
      day = 1
      month += 1
      if (month > 12) { month = 1; year += 1 }
      if (year > 9999) return undefined
    }
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Validated Stage 4A witnesses only; recorded arithmetic is recomputed. */
export function minimizeWitness(
  oldContractInput: unknown,
  newContractInput: unknown,
  witnessInput: unknown,
  searchOptionsInput: unknown,
  minimizationOptionsInput?: unknown,
): EvidenceResult<MinimizationResult> {
  const old = ContractSchema.safeParse(oldContractInput)
  const next = ContractSchema.safeParse(newContractInput)
  const witness = WitnessSchema.safeParse(witnessInput)
  const search = SearchOptionsSchema.safeParse(searchOptionsInput)
  const options = MinimizationOptionsSchema.safeParse(minimizationOptionsInput)
  const issues: MinimizationIssue[] = []
  if (!old.success) issues.push(...validationIssues(old.error, 'oldContract'))
  if (!next.success) issues.push(...validationIssues(next.error, 'newContract'))
  if (!witness.success) issues.push(...validationIssues(witness.error, 'witness'))
  if (!search.success) issues.push(...validationIssues(search.error, 'searchOptions'))
  if (!options.success) issues.push(...validationIssues(options.error, 'minimizationOptions'))
  if (!old.success || !next.success || !witness.success || !search.success || !options.success) {
    return { success: false, issues }
  }
  const original = witness.data.scenario
  const bounds = search.data
  const oldContract = old.data
  const newContract = next.data
  const outside = rangeIssues(original, bounds)
  if (outside.length) return { success: false, issues: outside.map((item) => ({ ...item, path: ['witness', 'scenario', ...item.path] })) }
  const comparison = compareContracts(oldContract, newContract, original)
  if (!comparison.success) return comparison
  if (!sameData(comparison.data, witness.data.comparison) || comparison.data.deltaCents !== witness.data.deltaCents) {
    return { success: false, issues: [{ code: 'witness_mismatch', path: ['witness'], message: 'Recorded witness comparison or delta does not match recomputation.' }] }
  }
  if (comparison.data.deltaCents === 0) {
    return { success: false, issues: [{ code: 'not_counterexample', path: ['witness', 'deltaCents'], message: 'A witness must have a nonzero recomputed cost difference.' }] }
  }

  let best = original
  let bestComparison = comparison.data
  let checksPerformed = 1
  const maxChecks = options.data.maxChecks
  const reductionSteps: ReductionStep[] = []
  const candidateFailures: MinimizationResult['candidateFailures'] = []
  const seen = new Set([JSON.stringify(original)])
  const direction = Math.sign(comparison.data.deltaCents)

  function attempt(candidate: Scenario, type: ReductionStep['type'], reason: string): boolean {
    if (checksPerformed >= maxChecks) return false
    const validated = SearchScenarioSchema.safeParse(candidate)
    if (!validated.success) {
      candidateFailures.push({ scenario: candidate, issues: validationIssues(validated.error, 'candidate') })
      return false
    }
    const data = validated.data
    const constraints = [...rangeIssues(data, bounds), ...invariantIssues(best, data)]
    if (constraints.length || compareObjectives(scenarioObjective(data), scenarioObjective(best)) >= 0) return false
    const key = JSON.stringify(data)
    if (seen.has(key)) return false
    seen.add(key)
    checksPerformed += 1
    const evaluated = compareContracts(oldContract, newContract, data)
    if (!evaluated.success) {
      candidateFailures.push({ scenario: data, issues: evaluated.issues })
      return false
    }
    if (Math.sign(evaluated.data.deltaCents) !== direction) return false
    reductionSteps.push({
      type, before: best, after: data, reason,
      validation: { success: true, deltaCents: evaluated.data.deltaCents, objective: scenarioObjective(data) },
      comparison: evaluated.data,
    })
    best = data
    bestComparison = evaluated.data
    return true
  }

  // A successful pass strictly decreases a bounded integer objective. Every
  // success also spends one of at most 300 comparisons, so cycles are bounded.
  let changed = true
  while (changed && checksPerformed < maxChecks) {
    changed = false
    const minimumCount = bounds.purchaseCountMin
    // Largest deletion first, then fixed left-to-right chunks and singletons.
    for (let size = best.transactions.length - minimumCount; size >= 1 && checksPerformed < maxChecks; size = size === 1 ? 0 : Math.floor(size / 2)) {
      let start = 0
      while (start < best.transactions.length && checksPerformed < maxChecks) {
        const removable = Math.min(size, best.transactions.length - start)
        if (best.transactions.length - removable < minimumCount) { start += size; continue }
        const candidate = { ...best, transactions: best.transactions.filter((_, index) => index < start || index >= start + removable) }
        if (attempt(candidate, 'remove-purchases', 'Delete a consecutive purchase group while retaining the cost-difference direction.')) {
          changed = true
          // Recheck the same position in the now shorter sequence.
        } else start += size
      }
    }
    if (checksPerformed >= maxChecks) break
    // Probe a coordinated amount reduction before individual ones. No success
    // or failure implies monotonicity of any untested amount.
    const lowerAll = {
      ...best, transactions: best.transactions.map((item) => ({ ...item, amountCents: bounds.purchaseAmountCentsMin })),
    }
    if (attempt(lowerAll, 'lower-purchase-amount', 'Probe the lower amount bound for all retained purchases.')) changed = true
    for (let index = 0; index < best.transactions.length && checksPerformed < maxChecks; index += 1) {
      const item = best.transactions[index]
      if (!item) continue
      for (const amount of smallerAmounts(bounds.purchaseAmountCentsMin, item.amountCents)) {
        if (checksPerformed >= maxChecks) break
        const candidate = {
          ...best, transactions: best.transactions.map((transaction, position) => position === index ? { ...transaction, amountCents: amount } : transaction),
        }
        if (attempt(candidate, 'lower-purchase-amount', 'Probe a smaller integer purchase amount without assuming monotonic fee differences.')) {
          changed = true
          break
        }
      }
    }
    // Delay ranges are at most 31 days: enumerate every smaller permitted delay.
    for (let index = 0; index < best.paymentEvents.length && checksPerformed < maxChecks; index += 1) {
      const payment = best.paymentEvents[index]
      if (!payment) continue
      const currentDelay = calendarDaysBetween(payment.dueOn, payment.paidOn)
      for (let delay = bounds.lateDaysMin; delay < currentDelay && checksPerformed < maxChecks; delay += 1) {
        const paidOn = dateAtDelay(payment.dueOn, delay)
        if (!paidOn) continue
        const candidate = {
          ...best, paymentEvents: best.paymentEvents.map((event, position) => position === index ? { ...event, paidOn } : event),
        }
        if (attempt(candidate, 'reduce-payment-delay', 'Move a completed payment closer to its unchanged due date.')) {
          changed = true
          break
        }
      }
    }
  }
  const budgetExhausted = checksPerformed === maxChecks
  return { success: true, data: {
    originalWitnessId: witness.data.candidateId, originalScenario: original, minimizedScenario: best,
    originalComparison: comparison.data, minimizedComparison: bestComparison,
    originalDeltaCents: comparison.data.deltaCents, minimizedDeltaCents: bestComparison.deltaCents,
    checksPerformed, budgetExhausted, terminationReason: budgetExhausted ? 'budget-exhausted' : 'strategy-complete',
    reductionSteps, minimizationOptions: options.data,
    originalObjective: scenarioObjective(original), minimizedObjective: scenarioObjective(best), candidateFailures,
  } }
}
