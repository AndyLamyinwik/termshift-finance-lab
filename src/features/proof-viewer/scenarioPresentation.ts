import { calendarDaysBetween } from '../../engine/dates'
import type { Scenario } from '../../models'
import { formatUsdCents } from '../dashboard/format'

/** Display only: summarize scenario data without performing fee calculations. */
export function purchaseTotalLabel(scenario: Scenario): string {
  const cents = scenario.transactions.reduce((total, transaction) => total + BigInt(transaction.amountCents), 0n)
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) return `Total exceeds the safe USD display range (${cents} cents).`
  return formatUsdCents(Number(cents))
}

export function paymentDelayLabel(scenario: Scenario): string {
  if (scenario.paymentEvents.length === 0) return 'No payment events'
  return scenario.paymentEvents.map((payment) => {
    const days = calendarDaysBetween(payment.dueOn, payment.paidOn)
    const delay = days === 0 ? 'on time' : days < 0 ? `${-days} days early` : `${days} days late`
    return `${payment.id}: ${delay} (due ${payment.dueOn}, paid ${payment.paidOn})`
  }).join('; ')
}

export function totalLateDays(scenario: Scenario): number {
  return scenario.paymentEvents.reduce((total, payment) => total + Math.max(0, calendarDaysBetween(payment.dueOn, payment.paidOn)), 0)
}
