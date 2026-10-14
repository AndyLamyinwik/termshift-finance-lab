import { calendarDaysBetween } from '../engine/dates'
import type { Scenario } from '../models'
import type { SearchOptions } from '../search'
import type { MinimizationIssue, MinimizationObjective } from './types'

/** Equality of validated JSON data, independent of object property order. */
export function sameData(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, index) => sameData(item, right[index]))
  }
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    const a = left as Record<string, unknown>
    const b = right as Record<string, unknown>
    const keys = Object.keys(a)
    return keys.length === Object.keys(b).length
      && keys.every((key) => Object.hasOwn(b, key) && sameData(a[key], b[key]))
  }
  return false
}

export function scenarioObjective(scenario: Scenario): MinimizationObjective {
  return {
    purchaseCount: scenario.transactions.length,
    purchaseTotalCents: scenario.transactions.reduce((sum, item) => sum + item.amountCents, 0),
    totalLateDays: scenario.paymentEvents.reduce((sum, item) => sum + Math.max(0, calendarDaysBetween(item.dueOn, item.paidOn)), 0),
  }
}
export function compareObjectives(a: MinimizationObjective, b: MinimizationObjective): number {
  return a.purchaseCount - b.purchaseCount || a.purchaseTotalCents - b.purchaseTotalCents || a.totalLateDays - b.totalLateDays
}
export function rangeIssues(scenario: Scenario, options: SearchOptions): MinimizationIssue[] {
  const issues: MinimizationIssue[] = []
  const add = (path: (string | number)[], message: string) => issues.push({ code: 'out_of_bounds', path, message })
  if (scenario.transactions.length < options.purchaseCountMin || scenario.transactions.length > options.purchaseCountMax) {
    add(['transactions'], 'Purchase count is outside the recorded Stage 4A bounds.')
  }
  scenario.transactions.forEach((item, index) => {
    if (item.amountCents < options.purchaseAmountCentsMin || item.amountCents > options.purchaseAmountCentsMax) {
      add(['transactions', index, 'amountCents'], 'Purchase amount is outside the recorded Stage 4A bounds.')
    }
  })
  scenario.paymentEvents.forEach((item, index) => {
    const days = Math.max(0, calendarDaysBetween(item.dueOn, item.paidOn))
    if (days < options.lateDaysMin || days > options.lateDaysMax) {
      add(['paymentEvents', index, 'paidOn'], 'Payment delay is outside the recorded Stage 4A bounds (early payments count as zero).')
    }
  })
  return issues
}

/** Purchase subsequence and payment order/identity are preserved; only reductions are allowed. */
export function invariantIssues(original: Scenario, candidate: Scenario): MinimizationIssue[] {
  const issues: MinimizationIssue[] = []
  const add = (path: (string | number)[], message: string) => issues.push({ code: 'invariant_violation', path, message })
  if (original.id !== candidate.id || original.billingMonth !== candidate.billingMonth) {
    add(['billingMonth'], 'Scenario identity and billing month must be retained.')
  }
  let cursor = 0
  candidate.transactions.forEach((item, index) => {
    while (cursor < original.transactions.length && original.transactions[cursor]?.id !== item.id) cursor += 1
    const before = original.transactions[cursor]
    if (!before || before.occurredOn !== item.occurredOn || before.kind !== item.kind || item.amountCents > before.amountCents) {
      add(['transactions', index], 'Purchases must retain their order, IDs, dates and kind, with amounts only lowered.')
    }
    cursor += 1
  })
  if (original.paymentEvents.length !== candidate.paymentEvents.length) {
    add(['paymentEvents'], 'Existing payment obligations must not be added or removed.')
  }
  candidate.paymentEvents.forEach((item, index) => {
    const before = original.paymentEvents[index]
    if (!before || before.id !== item.id || before.dueOn !== item.dueOn || before.amountCents !== item.amountCents) {
      add(['paymentEvents', index], 'Payment ID, order, due date and obligation amount must be retained.')
    } else {
      const prior = calendarDaysBetween(before.dueOn, before.paidOn)
      const after = calendarDaysBetween(item.dueOn, item.paidOn)
      if ((prior < 0 && item.paidOn !== before.paidOn) || (prior >= 0 && (after < 0 || after > prior))) {
        add(['paymentEvents', index, 'paidOn'], 'Late payments may only move toward dueOn; existing early payments stay unchanged.')
      }
    }
  })
  if (compareObjectives(scenarioObjective(candidate), scenarioObjective(original)) > 0) {
    add(['objective'], 'The lexicographic minimization objective must not worsen.')
  }
  return issues
}
