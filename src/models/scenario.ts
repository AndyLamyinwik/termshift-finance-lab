import { z } from 'zod'
import { BillingMonthSchema, CalendarDateSchema, IdSchema, PositiveCentsSchema } from './primitives'

export const MAX_TRANSACTIONS = 10000
export const MAX_PAYMENT_EVENTS = 1000

export const TransactionSchema = z.strictObject({
  id: IdSchema,
  occurredOn: CalendarDateSchema,
  amountCents: PositiveCentsSchema,
  kind: z.literal('purchase'),
})

export const PaymentEventSchema = z.strictObject({
  id: IdSchema,
  dueOn: CalendarDateSchema,
  paidOn: CalendarDateSchema,
  amountCents: PositiveCentsSchema,
})

function boundedArray<T extends z.ZodType>(itemSchema: T, limit: number) {
  // Reject oversized arrays before Zod traverses or copies their elements.
  return z.preprocess((input, context) => {
    if (Array.isArray(input) && input.length > limit) {
      context.addIssue({
        code: 'too_big',
        origin: 'array',
        maximum: limit,
        inclusive: true,
        message: `Array must contain at most ${limit} entries.`,
      })
      return z.NEVER
    }
    return input
  }, z.array(itemSchema).max(limit))
}

function checkUniqueIds(
  items: { id: string }[],
  field: 'transactions' | 'paymentEvents',
  context: z.RefinementCtx,
) {
  const seen = new Set<string>()
  items.forEach((item, index) => {
    if (seen.has(item.id)) {
      context.addIssue({
        code: 'custom',
        path: [field, index, 'id'],
        message: `Duplicate ID "${item.id}" within ${field}.`,
      })
    }
    seen.add(item.id)
  })
}

export const ScenarioSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: IdSchema,
  billingMonth: BillingMonthSchema,
  transactions: boundedArray(TransactionSchema, MAX_TRANSACTIONS),
  paymentEvents: boundedArray(PaymentEventSchema, MAX_PAYMENT_EVENTS),
}).superRefine((scenario, context) => {
  checkUniqueIds(scenario.transactions, 'transactions', context)
  checkUniqueIds(scenario.paymentEvents, 'paymentEvents', context)

  scenario.transactions.forEach((transaction, index) => {
    if (transaction.occurredOn.slice(0, 7) !== scenario.billingMonth) {
      context.addIssue({
        code: 'custom',
        path: ['transactions', index, 'occurredOn'],
        message: `Transaction must occur within billing month ${scenario.billingMonth}.`,
      })
    }
  })
})

export type Transaction = z.infer<typeof TransactionSchema>
export type PaymentEvent = z.infer<typeof PaymentEventSchema>
export type Scenario = z.infer<typeof ScenarioSchema>
