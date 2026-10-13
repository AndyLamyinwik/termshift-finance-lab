import { z } from 'zod'
import {
  NonNegativeCentsSchema,
  NonNegativeIntegerSchema,
  PositiveCentsSchema,
  PositiveIntegerSchema,
  RateBpsSchema,
} from './primitives'

export const WaiverSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('minTransactionCount'),
    threshold: PositiveIntegerSchema,
  }),
  z.strictObject({
    kind: z.literal('minPurchaseTotalCents'),
    threshold: PositiveCentsSchema,
  }),
], { error: 'Waiver kind must be minTransactionCount or minPurchaseTotalCents.' })

export const MonthlyFeeRuleSchema = z.strictObject({
  feeCents: NonNegativeCentsSchema,
  waiver: WaiverSchema,
})

export const TransactionFeeRuleSchema = z.strictObject({
  fixedCents: NonNegativeCentsSchema,
  rateBps: RateBpsSchema,
})

export const LateFeeRuleSchema = z.strictObject({
  feeCents: NonNegativeCentsSchema,
  graceDays: NonNegativeIntegerSchema,
})

export const FinancialRulesSchema = z.strictObject({
  monthlyFee: MonthlyFeeRuleSchema.optional(),
  transactionFee: TransactionFeeRuleSchema.optional(),
  lateFee: LateFeeRuleSchema.optional(),
}).refine(
  (rules) => rules.monthlyFee !== undefined
    || rules.transactionFee !== undefined
    || rules.lateFee !== undefined,
  'Contract must contain at least one financial rule.',
)

export type FeeWaiver = z.infer<typeof WaiverSchema>
export type MonthlyFeeRule = z.infer<typeof MonthlyFeeRuleSchema>
export type TransactionFeeRule = z.infer<typeof TransactionFeeRuleSchema>
export type LateFeeRule = z.infer<typeof LateFeeRuleSchema>
export type FinancialRules = z.infer<typeof FinancialRulesSchema>
