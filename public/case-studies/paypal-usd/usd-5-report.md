# PayPal USD published-rate evidence

Case: 1 × USD 5.00 (usd-5).

**Plan A: PayPal Checkout — 3.49% + USD 0.49.**
**Plan B: Static Micropayments rate model — 4.99% + USD 0.09.**

This compares two published fee schedules on synthetic merchant receipts. It is not a historical price change, a PayPal invoice, an account eligibility check, or an assertion of actual fees charged.

Source record: source-capture.json. Captured: 2026-10-27 (Asia/Shanghai). Fee-page update shown: 2026-10-01.
Official fees: https://www.paypal.com/us/business/paypal-business-fees
Eligibility terms: https://www.paypal.com/us/legalhub/paypal/useragreement-full#micropayments

Scope: US domestic commercial receipts, USD, eligible payment types and a previously approved Static Micropayments account for B. Dynamic Micropayments automatically selects the lower applicable fee per eligible transaction and is not represented by B. PayPal need not offer Static pricing and may convert Static accounts to Dynamic. Cross-border, currency conversion, refunds, reversals, disputes, chargebacks, negotiated rates, taxes and other products are excluded.

Rounding is a TermShift model assumption: round the proportional fee half up to cents separately for each transaction, then add its fixed fee. This case does not establish PayPal uses the same rounding policy.

Schema mapping: oldContract = Plan A; newContract = Plan B; deltaCents = B minus A. Both contract versions and effectiveDate values are fixture metadata, not PayPal product versions or implementation dates. Existing proof limitations also apply to these model inputs.

The recorded base witness came from a one-evaluation formal search. Purchase count is pinned to the supplied scenario; amount bounds span its original amounts. Uniform cases therefore have no available reduction; mixed cases may accept a reduction while preserving the difference direction. These bounds are not a claim of global minimality. Original and minimized results are separately recorded.

To independently reverify, import the matching *-proof.json through TermShift → Proof of Impact → Import Proof JSON. The source record is separate provenance data, not part of Proof Schema v1 and not an authenticated signature.

# Financial Experiment

**Plan A (Checkout) compared with Plan B (Static Micropayments model)**

Plan A model: paypal-checkout-a v1.0.0. Plan B model: paypal-static-micropayments-b v1.0.0.

Witness base, source base, sequence 0.

## Original Scenario

Scenario: paypal-usd-5. Billing month: 2026-10.

1 purchases, purchase total $5.00, total payment delay 0 calendar days.

| Purchase ID | Date | Amount |
| --- | --- | ---: |
| usd-5-purchase-1 | 2026-10-15 | $5.00 |

No payment obligations.

| Metric | Amount |
| --- | ---: |
| Plan A (Checkout) Total | $0.66 |
| Plan B (Static Micropayments) Total | $0.34 |
| Cost Difference (B minus A) | -$0.32 |

## Minimized Scenario

Scenario: paypal-usd-5. Billing month: 2026-10.

1 purchases, purchase total $5.00, total payment delay 0 calendar days.

| Purchase ID | Date | Amount |
| --- | --- | ---: |
| usd-5-purchase-1 | 2026-10-15 | $5.00 |

No payment obligations.

| Metric | Amount |
| --- | ---: |
| Plan A (Checkout) Total | $0.66 |
| Plan B (Static Micropayments) Total | $0.34 |
| Cost Difference (B minus A) | -$0.32 |

## Rule-Level Impact

| Rule | Plan A total | Plan B total | Difference |
| --- | ---: | ---: | ---: |
| Monthly fee | $0.00 | $0.00 | $0.00 |
| Transaction fee | $0.66 | $0.34 | -$0.32 |
| Late fee | $0.00 | $0.00 | $0.00 |

### Plan A (Checkout) Calculation Trace

- Purchase usd-5-purchase-1: amount $5.00, rate 349 bps, rounded variable fee $0.17, fixed fee $0.49, charged $0.66.

### Plan B (Static Micropayments) Calculation Trace

- Purchase usd-5-purchase-1: amount $5.00, rate 499 bps, rounded variable fee $0.25, fixed fee $0.09, charged $0.34.

## Reduction Summary

Purchases: 1 → 1. Purchase total: $5.00 → $5.00. Total late days: 0 → 0.

Cost difference: -$0.32 → -$0.32.

1/200 minimization comparisons; 0 accepted reductions. Termination: strategy-complete. Budget exhausted: no.

No valid improvement was accepted under this strategy and budget.

## Reproduction Information

Proof schema: 1. Engine: stage3-v1. Minimizer: stage4b-v1. Search seed: 20261027.

Recorded Stage 4A search options:

```json
{
  "seed": 20261027,
  "maxEvaluations": 1,
  "maxResults": 1,
  "purchaseCountMin": 1,
  "purchaseCountMax": 1,
  "purchaseAmountCentsMin": 500,
  "purchaseAmountCentsMax": 500,
  "lateDaysMin": 0,
  "lateDaysMax": 0
}
```

Load the proof JSON and call verifyImpactProof(proof). Original and minimized results are recalculated with compareContracts(oldContract, newContract, scenario). To repeat minimization, use the recorded original witness fields, searchOptions and maxChecks with minimizeWitness.

2 financial comparisons were recomputed when formatting this report. Recorded search provenance and rejected minimization attempts are not authenticated.

Calculation policy:

- currency: USD.
- moneyUnit: integer USD cents.
- rateUnit: integer basis points; 10000 bps = 100 percent.
- rounding: round half up separately for each transaction before adding its fixed fee.
- dates: Gregorian calendar days; early payments have zero late days.
- delta: Plan B total minus Plan A total.
- effectiveDate: descriptive contract metadata; does not restrict counterfactual scenarios.

## Limitations

- Contracts and transactions are synthetic financial experiments.
- A reduced witness is not a proof of a globally minimal counterexample.
- Verification checks the submitted calculations and constraints, not authenticated historical search execution.
- This JSON evidence has no digital signature, tamper-proof guarantee or financial regulatory certification.
- Search coverage.complete describes visited parameter tuples, not successful financial evaluation of every scenario.
