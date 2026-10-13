import { z } from 'zod'
import type { EngineIssue } from '../engine'
import type { SearchOptions } from './types'

function integerRange(min: number, max: number) {
  return z.number().int().min(min).max(max).transform((value) => value === 0 ? 0 : value)
}

export const SearchOptionsSchema = z.strictObject({
  seed: integerRange(0, 4294967295),
  maxEvaluations: integerRange(1, 500),
  maxResults: integerRange(1, 10),
  purchaseCountMin: integerRange(0, 30),
  purchaseCountMax: integerRange(0, 30),
  purchaseAmountCentsMin: integerRange(1, 100000),
  purchaseAmountCentsMax: integerRange(1, 100000),
  lateDaysMin: integerRange(0, 31),
  lateDaysMax: integerRange(0, 31),
}).superRefine((options, context) => {
  for (const [min, max] of [
    ['purchaseCountMin', 'purchaseCountMax'],
    ['purchaseAmountCentsMin', 'purchaseAmountCentsMax'],
    ['lateDaysMin', 'lateDaysMax'],
  ] as const) {
    if (options[min] > options[max]) {
      context.addIssue({ code: 'custom', path: [max], message: `${max} must be at least ${min}.` })
    }
  }
})

export function validateSearchOptions(input: unknown):
  | { success: true; data: SearchOptions }
  | { success: false; issues: EngineIssue[] } {
  const result = SearchOptionsSchema.safeParse(input)
  if (result.success) return { success: true, data: result.data }
  return {
    success: false,
    issues: result.error.issues.map((issue) => ({
      code: 'validation_error',
      path: issue.path.map((part) => typeof part === 'number' ? part : String(part)),
      message: issue.message,
      validationCode: issue.code,
    })),
  }
}
