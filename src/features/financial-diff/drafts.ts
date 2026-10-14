import { z } from 'zod'
import { validateContract } from '../../models'
import type { Contract, FinancialRules, ValidationIssue } from '../../models'

export interface ContractDraft {
  monthlyFee?: { feeUsd: string; waiverKind: string; threshold: string }
  transactionFee?: { fixedUsd: string; rateBps: string }
  lateFee?: { feeUsd: string; graceDays: string }
}

export interface DraftIssue {
  path: (string | number)[]
  code: string
  message: string
}

export type DraftResult<T> =
  | { success: true; data: T }
  | { success: false; issues: DraftIssue[] }

const MAX_NUMBER_INPUT_LENGTH = 24
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER)
// The final lookahead requires the absolute end, including after line terminators.
const USD_INPUT_PATTERN = /^(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?(?![\s\S])/
const INTEGER_INPUT_PATTERN = /^(0|[1-9][0-9]*)(?![\s\S])/

const ContractDraftSchema = z.strictObject({
  monthlyFee: z.strictObject({
    feeUsd: z.string(),
    waiverKind: z.enum(['minTransactionCount', 'minPurchaseTotalCents']),
    threshold: z.string(),
  }).optional(),
  transactionFee: z.strictObject({
    fixedUsd: z.string(),
    rateBps: z.string(),
  }).optional(),
  lateFee: z.strictObject({
    feeUsd: z.string(),
    graceDays: z.string(),
  }).optional(),
})

function inputFailure(code: string, message: string): DraftResult<never> {
  return { success: false, issues: [{ path: [], code, message }] }
}

/** Convert canonical USD decimal text to integer cents without floating arithmetic. */
export function parseUsdToCents(input: unknown): DraftResult<number> {
  if (typeof input !== 'string' || input.length > MAX_NUMBER_INPUT_LENGTH) {
    return inputFailure('invalid_usd_input', 'Enter a USD amount using at most 24 characters, such as 12.50.')
  }
  const match = USD_INPUT_PATTERN.exec(input)
  if (!match) {
    return inputFailure('invalid_usd_input', 'Enter a non-negative USD amount with at most two decimal places; spaces, signs, leading zeros and scientific notation are not allowed.')
  }
  const whole = match[1]
  if (whole === undefined) return inputFailure('invalid_usd_input', 'Enter a valid USD amount.')
  const fraction = (match[2] ?? '').padEnd(2, '0')
  const cents = BigInt(whole) * 100n + BigInt(fraction)
  if (cents > MAX_SAFE_BIGINT) {
    return inputFailure('unsafe_cents', 'USD amount must not exceed 90071992547409.91 (Number.MAX_SAFE_INTEGER cents).')
  }
  return { success: true, data: Number(cents) }
}

/** Parse a canonical non-negative integer text field with an explicit field range. */
export function parseIntegerInput(
  input: unknown,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
): DraftResult<number> {
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min < 0 || max < min) {
    return inputFailure('invalid_integer_bounds', 'Integer field bounds must be non-negative safe integers in increasing order.')
  }
  if (typeof input !== 'string' || input.length > MAX_NUMBER_INPUT_LENGTH || !INTEGER_INPUT_PATTERN.test(input)) {
    return inputFailure('invalid_integer_input', 'Enter a whole number using digits only; spaces, signs, leading zeros, decimals and scientific notation are not allowed.')
  }
  const integer = BigInt(input)
  if (integer < BigInt(min) || integer > BigInt(max)) {
    return inputFailure('integer_out_of_range', `Enter a whole number from ${min} to ${max}.`)
  }
  return { success: true, data: Number(integer) }
}

/** Plain ungrouped USD text for editing a formally validated cents value. */
export function formatCentsForInput(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new RangeError('Input cents must be a non-negative safe integer.')
  }
  const amount = BigInt(cents)
  return `${amount / 100n}.${String(amount % 100n).padStart(2, '0')}`
}

export function contractToDraft(contract: Contract): ContractDraft {
  const draft: ContractDraft = {}
  if (contract.rules.monthlyFee) {
    const { feeCents, waiver } = contract.rules.monthlyFee
    draft.monthlyFee = {
      feeUsd: formatCentsForInput(feeCents),
      waiverKind: waiver.kind,
      threshold: waiver.kind === 'minTransactionCount'
        ? String(waiver.threshold)
        : formatCentsForInput(waiver.threshold),
    }
  }
  if (contract.rules.transactionFee) {
    draft.transactionFee = {
      fixedUsd: formatCentsForInput(contract.rules.transactionFee.fixedCents),
      rateBps: String(contract.rules.transactionFee.rateBps),
    }
  }
  if (contract.rules.lateFee) {
    draft.lateFee = {
      feeUsd: formatCentsForInput(contract.rules.lateFee.feeCents),
      graceDays: String(contract.rules.lateFee.graceDays),
    }
  }
  return draft
}

function mapContractIssue(issue: ValidationIssue): DraftIssue {
  if (issue.path[0] !== 'rules') return { ...issue, path: [...issue.path] }
  const path = issue.path.slice(1)
  if (path[1] === 'feeCents') path[1] = 'feeUsd'
  if (path[1] === 'fixedCents') path[1] = 'fixedUsd'
  if (path[0] === 'monthlyFee' && path[1] === 'waiver') {
    if (path[2] === 'kind') return { ...issue, path: ['monthlyFee', 'waiverKind'] }
    if (path[2] === 'threshold') return { ...issue, path: ['monthlyFee', 'threshold'] }
  }
  return { ...issue, path }
}

/** Validate an editor draft while retaining the base contract's metadata and rule set. */
export function parseContractDraft(baseContractInput: unknown, draftInput: unknown): DraftResult<Contract> {
  const baseResult = validateContract(baseContractInput)
  if (!baseResult.success) {
    return {
      success: false,
      issues: baseResult.issues.map((issue) => ({ ...issue, path: ['baseContract', ...issue.path] })),
    }
  }
  const draftResult = ContractDraftSchema.safeParse(draftInput)
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

  const baseContract = baseResult.data
  const draft = draftResult.data
  const issues: DraftIssue[] = []
  for (const rule of ['monthlyFee', 'transactionFee', 'lateFee'] as const) {
    if (Boolean(baseContract.rules[rule]) !== Boolean(draft[rule])) {
      issues.push({
        path: [rule],
        code: 'rule_set_changed',
        message: baseContract.rules[rule]
          ? 'This existing financial rule must remain in the working contract.'
          : 'Adding a financial rule category is not supported in this workspace.',
      })
    }
  }

  function readNumber(result: DraftResult<number>, path: string[]): number | undefined {
    if (result.success) return result.data
    issues.push(...result.issues.map((issue) => ({ ...issue, path: [...path, ...issue.path] })))
    return undefined
  }

  const rules: FinancialRules = {}
  if (draft.monthlyFee) {
    const feeCents = readNumber(parseUsdToCents(draft.monthlyFee.feeUsd), ['monthlyFee', 'feeUsd'])
    const threshold = readNumber(
      draft.monthlyFee.waiverKind === 'minTransactionCount'
        ? parseIntegerInput(draft.monthlyFee.threshold, 1)
        : parseUsdToCents(draft.monthlyFee.threshold),
      ['monthlyFee', 'threshold'],
    )
    if (threshold === 0) {
      issues.push({ path: ['monthlyFee', 'threshold'], code: 'threshold_out_of_range', message: 'The purchase total waiver threshold must be at least USD 0.01.' })
    }
    if (feeCents !== undefined && threshold !== undefined) {
      rules.monthlyFee = { feeCents, waiver: { kind: draft.monthlyFee.waiverKind, threshold } }
    }
  }
  if (draft.transactionFee) {
    const fixedCents = readNumber(parseUsdToCents(draft.transactionFee.fixedUsd), ['transactionFee', 'fixedUsd'])
    const rateBps = readNumber(parseIntegerInput(draft.transactionFee.rateBps, 0, 10000), ['transactionFee', 'rateBps'])
    if (fixedCents !== undefined && rateBps !== undefined) rules.transactionFee = { fixedCents, rateBps }
  }
  if (draft.lateFee) {
    const feeCents = readNumber(parseUsdToCents(draft.lateFee.feeUsd), ['lateFee', 'feeUsd'])
    const graceDays = readNumber(parseIntegerInput(draft.lateFee.graceDays), ['lateFee', 'graceDays'])
    if (feeCents !== undefined && graceDays !== undefined) rules.lateFee = { feeCents, graceDays }
  }
  if (issues.length > 0) return { success: false, issues }

  const contractResult = validateContract({ ...baseContract, rules })
  return contractResult.success
    ? contractResult
    : { success: false, issues: contractResult.issues.map(mapContractIssue) }
}
