import type { Contract, Scenario } from '../../models'
import sourceCapture from './source-capture.json'

/** A dated, explicit observation of public tariffs, separate from the strict financial schemas. */
export const paypalSource = sourceCapture

export const planA: Contract = {
  schemaVersion: 1,
  id: 'paypal-checkout-a',
  name: 'Plan A model — PayPal Checkout',
  version: '1.0.0',
  currency: 'USD',
  billingCycle: 'calendar-month',
  effectiveDate: '2026-10-27',
  rules: { transactionFee: { rateBps: 349, fixedCents: 49 } },
}

export const planB: Contract = {
  schemaVersion: 1,
  id: 'paypal-static-micropayments-b',
  name: 'Plan B model — Static Micropayments',
  version: '1.0.0',
  currency: 'USD',
  billingCycle: 'calendar-month',
  effectiveDate: '2026-10-27',
  rules: { transactionFee: { rateBps: 499, fixedCents: 9 } },
}

export interface PayPalScenarioCase {
  id: string
  label: string
  scenario: Scenario
  /** Manually tabulated expectations, checked by an independent reference calculation in tests. */
  expected: { planACents: number; planBCents: number }
}

function example(
  id: string,
  label: string,
  amountsCents: number[],
  expected: [number, number],
): PayPalScenarioCase {
  return {
    id,
    label,
    scenario: {
      schemaVersion: 1,
      id: `paypal-${id}`,
      billingMonth: '2026-10',
      transactions: amountsCents.map((amountCents, index) => ({
        id: `${id}-purchase-${index + 1}`,
        occurredOn: '2026-10-15',
        amountCents,
        kind: 'purchase',
      })),
      paymentEvents: [],
    },
    expected: { planACents: expected[0], planBCents: expected[1] },
  }
}

export const paypalScenarios: readonly PayPalScenarioCase[] = [
  example('usd-1', '1 × USD 1.00', [100], [52, 14]),
  example('usd-5', '1 × USD 5.00', [500], [66, 34]),
  example('usd-10', '1 × USD 10.00', [1000], [84, 59]),
  example('usd-20', '1 × USD 20.00', [2000], [119, 109]),
  example('usd-26-66', '1 × USD 26.66', [2666], [142, 142]),
  example('usd-26-67', '1 × USD 26.67', [2667], [142, 142]),
  example('usd-30', '1 × USD 30.00', [3000], [154, 159]),
  example('usd-100', '1 × USD 100.00', [10000], [398, 508]),
  example('ten-usd-1', '10 × USD 1.00', Array<number>(10).fill(100), [520, 140]),
  example('mixed-basket', 'USD 1 + 10 + 30 + 100', [100, 1000, 3000, 10000], [688, 740]),
]
