import { z } from 'zod'
import {
  CalendarDateSchema, IdSchema, NonNegativeCentsSchema, NonNegativeIntegerSchema,
  PositiveIntegerSchema, RateBpsSchema, ScenarioSchema, SemverSchema,
} from '../models'

const signed = z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER)
const categories = {
  monthlyFeeCents: NonNegativeCentsSchema,
  transactionFeeCents: NonNegativeCentsSchema,
  lateFeeCents: NonNegativeCentsSchema,
}
const monthly = {
  ruleType: z.literal('monthlyFee'), originalFeeCents: NonNegativeCentsSchema,
  threshold: PositiveIntegerSchema, waived: z.boolean(), chargedCents: NonNegativeCentsSchema,
}
const TraceSchema = z.union([
  z.strictObject({ ...monthly, waiverKind: z.literal('minTransactionCount'), actualTransactionCount: NonNegativeIntegerSchema }),
  z.strictObject({ ...monthly, waiverKind: z.literal('minPurchaseTotalCents'), actualPurchaseTotalCents: NonNegativeCentsSchema }),
  z.strictObject({
    ruleType: z.literal('transactionFee'), transactionId: IdSchema, amountCents: PositiveIntegerSchema,
    fixedCents: NonNegativeCentsSchema, rateBps: RateBpsSchema,
    variableFeeCents: NonNegativeCentsSchema, chargedCents: NonNegativeCentsSchema,
  }),
  z.strictObject({
    ruleType: z.literal('lateFee'), paymentEventId: IdSchema, dueOn: CalendarDateSchema,
    paidOn: CalendarDateSchema, originalFeeCents: NonNegativeCentsSchema,
    lateDays: NonNegativeIntegerSchema, graceDays: NonNegativeIntegerSchema,
    graceExceeded: z.boolean(), chargedCents: NonNegativeCentsSchema,
  }),
])

/** Reject Stage 4A capacity excess before traversing array contents. */
export const SearchScenarioSchema = z.preprocess((input, context) => {
  if (input && typeof input === 'object') {
    for (const [key, limit] of [['transactions', 30], ['paymentEvents', 5]] as const) {
      const array = (input as Record<string, unknown>)[key]
      if (Array.isArray(array) && array.length > limit) {
        context.addIssue({ code: 'custom', path: [key], message: `Stage 4B accepts at most ${limit} ${key}.` })
        return z.NEVER
      }
    }
  }
  return input
}, ScenarioSchema)

const TraceArraySchema = z.preprocess((input, context) => {
  if (Array.isArray(input) && input.length > 36) {
    context.addIssue({ code: 'custom', message: 'A Stage 4B comparison accepts at most 36 trace entries per evaluation.' })
    return z.NEVER
  }
  return input
}, z.array(TraceSchema).max(36))
const EvaluationSchema = z.strictObject({
  ...categories, contractId: IdSchema, contractVersion: SemverSchema, scenarioId: IdSchema,
  currency: z.literal('USD'), totalCents: NonNegativeCentsSchema,
  trace: TraceArraySchema,
})
export const ComparisonSchema = z.strictObject({
  oldEvaluation: EvaluationSchema, newEvaluation: EvaluationSchema, deltaCents: signed,
  deltaByCategoryCents: z.strictObject({ monthlyFeeCents: signed, transactionFeeCents: signed, lateFeeCents: signed }),
})
export const WitnessSchema = z.strictObject({
  candidateId: IdSchema, sequence: z.number().int().min(0).max(2512),
  source: z.enum(['base', 'boundary', 'seeded']),
  parameters: z.strictObject({
    purchaseCount: z.number().int().min(0).max(30),
    purchaseAmountCents: z.number().int().min(1).max(100000), lateDays: z.number().int().min(0).max(31),
  }).optional(),
  scenario: SearchScenarioSchema, comparison: ComparisonSchema, deltaCents: signed,
})
export const MinimizationOptionsSchema = z.strictObject({
  maxChecks: z.number().int().min(1).max(300).default(200),
}).prefault({})
export const ObjectiveSchema = z.strictObject({
  purchaseCount: z.number().int().min(0).max(30),
  purchaseTotalCents: z.number().int().min(0).max(3000000), totalLateDays: z.number().int().min(0).max(155),
})
export const ReductionStepSchema = z.strictObject({
  type: z.enum(['remove-purchases', 'lower-purchase-amount', 'reduce-payment-delay']),
  before: SearchScenarioSchema, after: SearchScenarioSchema,
  reason: z.string().min(1).max(300),
  validation: z.strictObject({ success: z.literal(true), deltaCents: signed, objective: ObjectiveSchema }),
  comparison: ComparisonSchema,
})
