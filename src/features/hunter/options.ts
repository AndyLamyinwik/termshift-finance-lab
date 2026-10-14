import { z } from 'zod'
import type { EngineResult } from '../../engine'
import { validateScenario } from '../../models'
import type { Scenario, ValidationIssue } from '../../models'
import { validateSearchOptions } from '../../search'
import type { SearchOptions } from '../../search'
import {
  formatCentsForInput,
  parseIntegerInput,
  parseUsdToCents,
} from '../financial-diff/drafts'
import type { DraftIssue, DraftResult } from '../financial-diff/drafts'

export interface SearchOptionsDraft {
  seed: string
  maxEvaluations: string
  maxResults: string
  purchaseCountMin: string
  purchaseCountMax: string
  purchaseAmountUsdMin: string
  purchaseAmountUsdMax: string
  lateDaysMin: string
  lateDaysMax: string
}

const SearchOptionsDraftSchema = z.strictObject({
  seed: z.string(),
  maxEvaluations: z.string(),
  maxResults: z.string(),
  purchaseCountMin: z.string(),
  purchaseCountMax: z.string(),
  purchaseAmountUsdMin: z.string(),
  purchaseAmountUsdMax: z.string(),
  lateDaysMin: z.string(),
  lateDaysMax: z.string(),
})

const defaultOptionsResult = validateSearchOptions({
  seed: 20260401,
  maxEvaluations: 120,
  maxResults: 5,
  purchaseCountMin: 0,
  purchaseCountMax: 10,
  purchaseAmountCentsMin: 100,
  purchaseAmountCentsMax: 1000,
  lateDaysMin: 0,
  lateDaysMax: 5,
})

if (!defaultOptionsResult.success) {
  throw new Error('Counterexample Hunter defaults must satisfy SearchOptionsSchema.')
}

export const DEFAULT_SEARCH_OPTIONS: Readonly<SearchOptions> = Object.freeze(defaultOptionsResult.data)

/** Each workspace receives independent text fields; search only receives validated numbers. */
export function createSearchOptionsDraft(): SearchOptionsDraft {
  return {
    seed: String(DEFAULT_SEARCH_OPTIONS.seed),
    maxEvaluations: String(DEFAULT_SEARCH_OPTIONS.maxEvaluations),
    maxResults: String(DEFAULT_SEARCH_OPTIONS.maxResults),
    purchaseCountMin: String(DEFAULT_SEARCH_OPTIONS.purchaseCountMin),
    purchaseCountMax: String(DEFAULT_SEARCH_OPTIONS.purchaseCountMax),
    purchaseAmountUsdMin: formatCentsForInput(DEFAULT_SEARCH_OPTIONS.purchaseAmountCentsMin),
    purchaseAmountUsdMax: formatCentsForInput(DEFAULT_SEARCH_OPTIONS.purchaseAmountCentsMax),
    lateDaysMin: String(DEFAULT_SEARCH_OPTIONS.lateDaysMin),
    lateDaysMax: String(DEFAULT_SEARCH_OPTIONS.lateDaysMax),
  }
}

function draftPath(path: (string | number)[]): (string | number)[] {
  return path.map((part) => {
    if (part === 'purchaseAmountCentsMin') return 'purchaseAmountUsdMin'
    if (part === 'purchaseAmountCentsMax') return 'purchaseAmountUsdMax'
    return part
  })
}

/** Parse canonical text exactly, then enforce all Stage 4A field and paired-range limits. */
export function parseSearchOptionsDraft(input: unknown): DraftResult<SearchOptions> {
  const draftResult = SearchOptionsDraftSchema.safeParse(input)
  if (!draftResult.success) {
    return {
      success: false,
      issues: draftResult.error.issues.map((issue) => ({
        path: issue.path.map((part) => typeof part === 'number' ? part : String(part)),
        code: issue.code,
        message: issue.message,
      })),
    }
  }

  const draft = draftResult.data
  const issues: DraftIssue[] = []
  function read(result: DraftResult<number>, field: keyof SearchOptionsDraft): number {
    if (result.success) return result.data
    issues.push(...result.issues.map((issue) => ({ ...issue, path: [field, ...issue.path] })))
    // An invalid draft returns before this transient object can reach the search validator.
    return 0
  }

  const options: SearchOptions = {
    seed: read(parseIntegerInput(draft.seed, 0, 4294967295), 'seed'),
    maxEvaluations: read(parseIntegerInput(draft.maxEvaluations, 1, 500), 'maxEvaluations'),
    maxResults: read(parseIntegerInput(draft.maxResults, 1, 10), 'maxResults'),
    purchaseCountMin: read(parseIntegerInput(draft.purchaseCountMin, 0, 30), 'purchaseCountMin'),
    purchaseCountMax: read(parseIntegerInput(draft.purchaseCountMax, 0, 30), 'purchaseCountMax'),
    purchaseAmountCentsMin: read(parseUsdToCents(draft.purchaseAmountUsdMin), 'purchaseAmountUsdMin'),
    purchaseAmountCentsMax: read(parseUsdToCents(draft.purchaseAmountUsdMax), 'purchaseAmountUsdMax'),
    lateDaysMin: read(parseIntegerInput(draft.lateDaysMin, 0, 31), 'lateDaysMin'),
    lateDaysMax: read(parseIntegerInput(draft.lateDaysMax, 0, 31), 'lateDaysMax'),
  }
  if (issues.length > 0) return { success: false, issues }

  const result = validateSearchOptions(options)
  return result.success
    ? result
    : {
      success: false,
      issues: result.issues.map((issue) => ({ ...issue, path: draftPath(issue.path) })),
    }
}

function scenarioFailure(issues: ValidationIssue[]): EngineResult<never> {
  return {
    success: false,
    issues: issues.map((issue) => ({
      code: 'validation_error',
      path: ['baseScenario', ...issue.path],
      message: issue.message,
      validationCode: issue.code,
    })),
  }
}

/** Validate first, then create a separate search scenario with existing obligations paid on time. */
export function createSearchBase(input: unknown): EngineResult<Scenario> {
  const original = validateScenario(input)
  if (!original.success) return scenarioFailure(original.issues)

  const base: Scenario = {
    ...original.data,
    transactions: [],
    paymentEvents: original.data.paymentEvents.map((payment) => ({ ...payment, paidOn: payment.dueOn })),
  }
  const validated = validateScenario(base)
  return validated.success ? validated : scenarioFailure(validated.issues)
}
