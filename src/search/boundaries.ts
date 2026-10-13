import { calendarDaysBetween } from '../engine/dates'
import type { Contract, Scenario } from '../models'
import type { CandidateParameters, SearchOptions } from './types'

export const MAX_BOUNDARY_CANDIDATES = 512

function within(value: number, min: number, max: number): boolean {
  return Number.isSafeInteger(value) && value >= min && value <= max
}

function valuesInRange(values: number[], min: number, max: number): number[] {
  return [...new Set(values.filter((value) => within(value, min, max)))]
}

function near(value: bigint): bigint[] {
  return [value - 1n, value, value + 1n]
}

function ceilRatio(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator
}

/**
 * Derive parameter candidates, never fee results. All amounts used in boundary
 * algebra are bigint; compareContracts remains the sole financial evaluator.
 * Sparse rule families precede the denser total-waiver subdivisions. The stream
 * is lazy, deduplicated, strictly filtered by the supplied inclusive ranges,
 * and bounded even when thresholds are far outside the search space.
 */
export function* boundaryParameters(
  oldContract: Contract,
  newContract: Contract,
  baseScenario: Scenario,
  options: SearchOptions,
): Generator<CandidateParameters> {
  const contracts = [oldContract, newContract]
  const countAnchors = valuesInRange([
    options.purchaseCountMax,
    options.purchaseCountMin,
    1,
    baseScenario.transactions.length,
  ], options.purchaseCountMin, options.purchaseCountMax)
  const amountAnchors = valuesInRange([
    options.purchaseAmountCentsMin,
    options.purchaseAmountCentsMax,
    baseScenario.transactions[0]?.amountCents ?? options.purchaseAmountCentsMin,
  ], options.purchaseAmountCentsMin, options.purchaseAmountCentsMax)
  const firstPayment = baseScenario.paymentEvents[0]
  const dayAnchors = valuesInRange([
    options.lateDaysMin,
    options.lateDaysMax,
    ...(firstPayment ? [calendarDaysBetween(firstPayment.dueOn, firstPayment.paidOn)] : []),
  ], options.lateDaysMin, options.lateDaysMax)
  const seen = new Set<string>()

  function offer(count: bigint, amount: bigint, days: bigint): CandidateParameters | undefined {
    if (seen.size >= MAX_BOUNDARY_CANDIDATES
      || count < BigInt(options.purchaseCountMin) || count > BigInt(options.purchaseCountMax)
      || amount < BigInt(options.purchaseAmountCentsMin) || amount > BigInt(options.purchaseAmountCentsMax)
      || days < BigInt(options.lateDaysMin) || days > BigInt(options.lateDaysMax)) {
      return undefined
    }
    const key = `${count}:${amount}:${days}`
    if (seen.has(key)) return undefined
    seen.add(key)
    return {
      purchaseCount: Number(count),
      purchaseAmountCents: Number(amount),
      lateDays: Number(days),
    }
  }

  const anchorCount = BigInt(options.purchaseCountMax)
  const anchorDays = BigInt(options.lateDaysMin)

  // Both sides of a count waiver, under small and large allowed purchases.
  for (const contract of contracts) {
    const waiver = contract.rules.monthlyFee?.waiver
    if (waiver?.kind !== 'minTransactionCount') continue
    for (const count of near(BigInt(waiver.threshold))) {
      for (const amount of amountAnchors) {
        const candidate = offer(count, BigInt(amount), anchorDays)
        if (candidate) yield candidate
      }
    }
  }

  // Nominal crossover of the two linear fee parameters, before cent rounding.
  // Missing transaction rules have zero fixed/rate parameters for this algebra.
  const oldFee = oldContract.rules.transactionFee
  const newFee = newContract.rules.transactionFee
  let numerator = (BigInt(oldFee?.fixedCents ?? 0) - BigInt(newFee?.fixedCents ?? 0)) * 10000n
  let denominator = BigInt(newFee?.rateBps ?? 0) - BigInt(oldFee?.rateBps ?? 0)
  if (denominator < 0n) {
    numerator = -numerator
    denominator = -denominator
  }
  const crossoverAmounts: bigint[] = []
  if (denominator > 0n && numerator >= 0n) {
    for (const ratio of [numerator / denominator, ceilRatio(numerator, denominator)]) {
      for (const amount of near(ratio)) {
        const candidate = offer(anchorCount, amount, anchorDays)
        if (candidate) yield candidate
        if (amount >= BigInt(options.purchaseAmountCentsMin)
          && amount <= BigInt(options.purchaseAmountCentsMax)) {
          crossoverAmounts.push(amount)
        }
      }
    }
  }

  // The next/preceding half-cent threshold near endpoints, the base amount, and
  // the crossover. This derives a bounded sample of rounding transitions from
  // actual rates, rather than enumerating every possible transaction amount.
  for (const contract of contracts) {
    const rate = BigInt(contract.rules.transactionFee?.rateBps ?? 0)
    if (rate === 0n) continue
    const anchors = [...new Set([...amountAnchors.map(BigInt), ...crossoverAmounts])]
    for (const anchor of anchors) {
      const scaled = anchor * rate - 5000n
      const precedingIndex = scaled > 0n ? scaled / 10000n : 0n
      for (const index of [precedingIndex, precedingIndex + 1n]) {
        const transition = ceilRatio(index * 10000n + 5000n, rate)
        for (const amount of near(transition)) {
          const candidate = offer(anchorCount, amount, anchorDays)
          if (candidate) yield candidate
        }
      }
    }
  }

  // Only existing obligations support a delay search; none are invented.
  if (firstPayment) {
    for (const contract of contracts) {
      const lateFee = contract.rules.lateFee
      if (!lateFee) continue
      for (const days of near(BigInt(lateFee.graceDays))) {
        const candidate = offer(anchorCount, BigInt(options.purchaseAmountCentsMin), days)
        if (candidate) yield candidate
      }
    }
  }

  // For uniform purchases, a total threshold T corresponds to per-purchase
  // values around floor(T/n) and ceil(T/n). n stays within the 30-purchase cap.
  const positiveCounts = [...new Set([
    ...countAnchors,
    ...Array.from({ length: 30 }, (_, index) => index + 1),
  ])].filter((count) => within(count, Math.max(1, options.purchaseCountMin), options.purchaseCountMax))
  for (const contract of contracts) {
    const waiver = contract.rules.monthlyFee?.waiver
    if (waiver?.kind !== 'minPurchaseTotalCents') continue
    const threshold = BigInt(waiver.threshold)
    for (const count of positiveCounts) {
      const divisor = BigInt(count)
      for (const ratio of [threshold / divisor, ceilRatio(threshold, divisor)]) {
        for (const amount of near(ratio)) {
          const candidate = offer(divisor, amount, anchorDays)
          if (candidate) yield candidate
        }
      }
    }
  }

  // A tiny bounded anchor product (at most 4 × 3 × 3), never the full space.
  for (const count of countAnchors) {
    for (const amount of amountAnchors) {
      for (const days of dayAnchors) {
        const candidate = offer(BigInt(count), BigInt(amount), BigInt(days))
        if (candidate) yield candidate
      }
    }
  }
}
