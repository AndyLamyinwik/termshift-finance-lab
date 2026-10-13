import { z } from 'zod'
import { CalendarDateSchema, IdSchema, NameSchema, SemverSchema } from './primitives'
import { FinancialRulesSchema } from './rules'

export const ContractSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: IdSchema,
  name: NameSchema,
  version: SemverSchema,
  currency: z.literal('USD'),
  billingCycle: z.literal('calendar-month'),
  effectiveDate: CalendarDateSchema,
  rules: FinancialRulesSchema,
})

export type Contract = z.infer<typeof ContractSchema>
