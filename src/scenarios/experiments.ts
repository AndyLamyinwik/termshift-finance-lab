import type { Contract, Scenario } from '../models'

export type ExperimentFixture = {
  id: string
  name: string
  description: string
  oldContract: Contract
  newContract: Contract
  scenario: Scenario
}

export const waiverTrapExperiment = {
  id: 'waiver-trap',
  name: 'The Waiver Trap',
  description:
    'Fully synthetic contracts and purchases for a future waiver comparison. The old contract requires at least 5 purchases; the new contract requires a monthly purchase total of at least 50000 USD cents. The scenario contains 5 purchases of 1000 USD cents each. No fees or comparison results have been calculated.',
  oldContract: {
    schemaVersion: 1,
    id: 'waiver-trap-old',
    name: 'Synthetic Waiver Trap Contract',
    version: '1.0.0',
    currency: 'USD',
    billingCycle: 'calendar-month',
    effectiveDate: '2026-01-01',
    rules: {
      monthlyFee: {
        feeCents: 1200,
        waiver: { kind: 'minTransactionCount', threshold: 5 },
      },
    },
  },
  newContract: {
    schemaVersion: 1,
    id: 'waiver-trap-new',
    name: 'Synthetic Waiver Trap Contract',
    version: '2.0.0',
    currency: 'USD',
    billingCycle: 'calendar-month',
    effectiveDate: '2026-06-01',
    rules: {
      monthlyFee: {
        feeCents: 1200,
        waiver: { kind: 'minPurchaseTotalCents', threshold: 50000 },
      },
    },
  },
  scenario: {
    schemaVersion: 1,
    id: 'waiver-trap-may-2026',
    billingMonth: '2026-05',
    transactions: [
      { id: 'waiver-purchase-1', occurredOn: '2026-05-02', amountCents: 1000, kind: 'purchase' },
      { id: 'waiver-purchase-2', occurredOn: '2026-05-08', amountCents: 1000, kind: 'purchase' },
      { id: 'waiver-purchase-3', occurredOn: '2026-05-14', amountCents: 1000, kind: 'purchase' },
      { id: 'waiver-purchase-4', occurredOn: '2026-05-20', amountCents: 1000, kind: 'purchase' },
      { id: 'waiver-purchase-5', occurredOn: '2026-05-26', amountCents: 1000, kind: 'purchase' },
    ],
    paymentEvents: [],
  },
} satisfies ExperimentFixture

export const microtransactionPenaltyExperiment = {
  id: 'microtransaction-penalty',
  name: 'The Microtransaction Penalty',
  description:
    'Fully synthetic contracts and purchases for a future transaction-fee comparison. The old contract specifies 100 basis points and no fixed fee; the new contract specifies 60 basis points and 20 USD cents per purchase. The scenario contains 10 purchases of 100 USD cents each. No fees or comparison results have been calculated.',
  oldContract: {
    schemaVersion: 1,
    id: 'microtransaction-penalty-old',
    name: 'Synthetic Microtransaction Penalty Contract',
    version: '1.0.0',
    currency: 'USD',
    billingCycle: 'calendar-month',
    effectiveDate: '2026-01-01',
    rules: { transactionFee: { fixedCents: 0, rateBps: 100 } },
  },
  newContract: {
    schemaVersion: 1,
    id: 'microtransaction-penalty-new',
    name: 'Synthetic Microtransaction Penalty Contract',
    version: '2.0.0',
    currency: 'USD',
    billingCycle: 'calendar-month',
    effectiveDate: '2026-06-01',
    rules: { transactionFee: { fixedCents: 20, rateBps: 60 } },
  },
  scenario: {
    schemaVersion: 1,
    id: 'microtransaction-penalty-may-2026',
    billingMonth: '2026-05',
    transactions: [
      { id: 'micro-purchase-1', occurredOn: '2026-05-01', amountCents: 100, kind: 'purchase' },
      { id: 'micro-purchase-2', occurredOn: '2026-05-03', amountCents: 100, kind: 'purchase' },
      { id: 'micro-purchase-3', occurredOn: '2026-05-05', amountCents: 100, kind: 'purchase' },
      { id: 'micro-purchase-4', occurredOn: '2026-05-07', amountCents: 100, kind: 'purchase' },
      { id: 'micro-purchase-5', occurredOn: '2026-05-09', amountCents: 100, kind: 'purchase' },
      { id: 'micro-purchase-6', occurredOn: '2026-05-11', amountCents: 100, kind: 'purchase' },
      { id: 'micro-purchase-7', occurredOn: '2026-05-13', amountCents: 100, kind: 'purchase' },
      { id: 'micro-purchase-8', occurredOn: '2026-05-15', amountCents: 100, kind: 'purchase' },
      { id: 'micro-purchase-9', occurredOn: '2026-05-17', amountCents: 100, kind: 'purchase' },
      { id: 'micro-purchase-10', occurredOn: '2026-05-19', amountCents: 100, kind: 'purchase' },
    ],
    paymentEvents: [],
  },
} satisfies ExperimentFixture

export const gracePeriodShiftExperiment = {
  id: 'grace-period-shift',
  name: 'The Grace Period Shift',
  description:
    'Fully synthetic contracts and a completed payment for a future grace-period comparison. Both contracts specify a late fee of 1500 USD cents; the grace period changes from 3 calendar days to 1. Payment is due on 2026-05-15 and completed on 2026-05-17. Its 10000 USD cents amount is an arbitrary fictional fixture value. No fees or comparison results have been calculated.',
  oldContract: {
    schemaVersion: 1,
    id: 'grace-period-shift-old',
    name: 'Synthetic Grace Period Shift Contract',
    version: '1.0.0',
    currency: 'USD',
    billingCycle: 'calendar-month',
    effectiveDate: '2026-01-01',
    rules: { lateFee: { feeCents: 1500, graceDays: 3 } },
  },
  newContract: {
    schemaVersion: 1,
    id: 'grace-period-shift-new',
    name: 'Synthetic Grace Period Shift Contract',
    version: '2.0.0',
    currency: 'USD',
    billingCycle: 'calendar-month',
    effectiveDate: '2026-06-01',
    rules: { lateFee: { feeCents: 1500, graceDays: 1 } },
  },
  scenario: {
    schemaVersion: 1,
    id: 'grace-period-shift-may-2026',
    billingMonth: '2026-05',
    transactions: [],
    paymentEvents: [
      {
        id: 'grace-payment-1',
        dueOn: '2026-05-15',
        paidOn: '2026-05-17',
        amountCents: 10000,
      },
    ],
  },
} satisfies ExperimentFixture

export const experiments = [
  waiverTrapExperiment,
  microtransactionPenaltyExperiment,
  gracePeriodShiftExperiment,
] as const satisfies readonly ExperimentFixture[]
