import { validateScenario } from '../models'
import type { Scenario, ValidationIssue } from '../models'
import type { CandidateGenerationResult, CandidateParameters, SearchIssue, SearchOptions } from './types'

export interface SeededPrng {
  nextUint32(): number
  nextInt(min: number, max: number): number
}

/**
 * Local full-period 32-bit LCG, including seed 0. Inclusive integer sampling
 * uses modulo reduction, with a small bias when range size does not divide
 * 2^32. It is a deterministic exploration sampler, not a security generator.
 */
export function createSeededPrng(seed: number): SeededPrng {
  if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) {
    throw new RangeError('Seed must be an integer from 0 to 4294967295.')
  }
  let state = seed >>> 0
  function nextUint32(): number {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state
  }
  return {
    nextUint32,
    nextInt(min: number, max: number): number {
      const width = max - min + 1
      if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max)
        || !Number.isSafeInteger(width) || width <= 0 || width > 4294967296) {
        throw new RangeError('Integer sample range must be ordered and contain at most 2^32 safe integers.')
      }
      return min + nextUint32() % width
    },
  }
}

export function seededParameters(prng: SeededPrng, options: SearchOptions): CandidateParameters {
  return {
    purchaseCount: prng.nextInt(options.purchaseCountMin, options.purchaseCountMax),
    purchaseAmountCents: prng.nextInt(options.purchaseAmountCentsMin, options.purchaseAmountCentsMax),
    lateDays: prng.nextInt(options.lateDaysMin, options.lateDaysMax),
  }
}

function normalizeValidationIssues(issues: ValidationIssue[]): SearchIssue[] {
  return issues.map((issue) => ({
    code: 'validation_error',
    path: issue.path,
    message: issue.message,
    validationCode: issue.code,
  }))
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

/** Add at most 31 calendar days to an already validated Gregorian date. */
function addCalendarDays(date: string, delay: number): string | undefined {
  let year = Number(date.slice(0, 4))
  let month = Number(date.slice(5, 7))
  let day = Number(date.slice(8, 10))
  for (let index = 0; index < delay; index += 1) {
    day += 1
    if (day > daysInMonth(year, month)) {
      day = 1
      month += 1
      if (month > 12) {
        month = 1
        year += 1
        if (year > 9999) return undefined
      }
    }
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Generate only uniform purchases and a shared delay for existing payments. */
export function generateCandidateScenario(
  baseScenario: Scenario,
  parameters: CandidateParameters,
  candidateId: string,
): CandidateGenerationResult {
  const issues: SearchIssue[] = []
  if (baseScenario.transactions.length > 30) {
    issues.push({ code: 'capacity_exceeded', path: ['transactions'], message: 'Search accepts at most 30 base transactions.' })
  }
  if (baseScenario.paymentEvents.length > 5) {
    issues.push({ code: 'capacity_exceeded', path: ['paymentEvents'], message: 'Search accepts at most 5 existing payment events.' })
  }
  for (const [field, min, max] of [
    ['purchaseCount', 0, 30],
    ['purchaseAmountCents', 1, 100000],
    ['lateDays', 0, 31],
  ] as const) {
    const value = parameters[field]
    if (!Number.isInteger(value) || value < min || value > max) {
      issues.push({
        code: 'validation_error',
        path: ['parameters', field],
        message: `${field} must be an integer from ${min} to ${max}.`,
        validationCode: 'custom',
      })
    }
  }
  if (issues.length > 0) return { success: false, issues }

  const validatedBase = validateScenario(baseScenario)
  if (!validatedBase.success) {
    return { success: false, issues: normalizeValidationIssues(validatedBase.issues) }
  }
  const paymentEvents: Scenario['paymentEvents'] = []
  for (const [index, payment] of validatedBase.data.paymentEvents.entries()) {
    const paidOn = addCalendarDays(payment.dueOn, parameters.lateDays)
    if (!paidOn) {
      return {
        success: false,
        issues: [{
          code: 'candidate_date_out_of_range',
          path: ['paymentEvents', index, 'paidOn'],
          message: 'Generated payment date exceeds Gregorian year 9999.',
        }],
      }
    }
    paymentEvents.push({ ...payment, paidOn })
  }

  const candidate: Scenario = {
    ...validatedBase.data,
    id: candidateId,
    transactions: Array.from({ length: parameters.purchaseCount }, (_, index) => ({
      id: `search-purchase-${index + 1}`,
      occurredOn: `${validatedBase.data.billingMonth}-01`,
      amountCents: parameters.purchaseAmountCents,
      kind: 'purchase',
    })),
    paymentEvents,
  }
  const validatedCandidate = validateScenario(candidate)
  return validatedCandidate.success
    ? { success: true, scenario: validatedCandidate.data }
    : { success: false, issues: normalizeValidationIssues(validatedCandidate.issues) }
}
