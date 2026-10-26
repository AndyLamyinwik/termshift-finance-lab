# PayPal USD published-rate evidence

Case: USD 1 + 10 + 30 + 100 (mixed-basket).

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

Scenario: paypal-mixed-basket. Billing month: 2026-10.

4 purchases, purchase total $141.00, total payment delay 0 calendar days.

| Purchase ID | Date | Amount |
| --- | --- | ---: |
| mixed-basket-purchase-1 | 2026-10-15 | $1.00 |
| mixed-basket-purchase-2 | 2026-10-15 | $10.00 |
| mixed-basket-purchase-3 | 2026-10-15 | $30.00 |
| mixed-basket-purchase-4 | 2026-10-15 | $100.00 |

No payment obligations.

| Metric | Amount |
| --- | ---: |
| Plan A (Checkout) Total | $6.88 |
| Plan B (Static Micropayments) Total | $7.40 |
| Cost Difference (B minus A) | +$0.52 |

## Minimized Scenario

Scenario: paypal-mixed-basket. Billing month: 2026-10.

4 purchases, purchase total $106.01, total payment delay 0 calendar days.

| Purchase ID | Date | Amount |
| --- | --- | ---: |
| mixed-basket-purchase-1 | 2026-10-15 | $1.00 |
| mixed-basket-purchase-2 | 2026-10-15 | $1.00 |
| mixed-basket-purchase-3 | 2026-10-15 | $4.31 |
| mixed-basket-purchase-4 | 2026-10-15 | $99.70 |

No payment obligations.

| Metric | Amount |
| --- | ---: |
| Plan A (Checkout) Total | $5.65 |
| Plan B (Static Micropayments) Total | $5.66 |
| Cost Difference (B minus A) | +$0.01 |

## Rule-Level Impact

| Rule | Plan A total | Plan B total | Difference |
| --- | ---: | ---: | ---: |
| Monthly fee | $0.00 | $0.00 | $0.00 |
| Transaction fee | $5.65 | $5.66 | +$0.01 |
| Late fee | $0.00 | $0.00 | $0.00 |

### Plan A (Checkout) Calculation Trace

- Purchase mixed-basket-purchase-1: amount $1.00, rate 349 bps, rounded variable fee $0.03, fixed fee $0.49, charged $0.52.
- Purchase mixed-basket-purchase-2: amount $1.00, rate 349 bps, rounded variable fee $0.03, fixed fee $0.49, charged $0.52.
- Purchase mixed-basket-purchase-3: amount $4.31, rate 349 bps, rounded variable fee $0.15, fixed fee $0.49, charged $0.64.
- Purchase mixed-basket-purchase-4: amount $99.70, rate 349 bps, rounded variable fee $3.48, fixed fee $0.49, charged $3.97.

### Plan B (Static Micropayments) Calculation Trace

- Purchase mixed-basket-purchase-1: amount $1.00, rate 499 bps, rounded variable fee $0.05, fixed fee $0.09, charged $0.14.
- Purchase mixed-basket-purchase-2: amount $1.00, rate 499 bps, rounded variable fee $0.05, fixed fee $0.09, charged $0.14.
- Purchase mixed-basket-purchase-3: amount $4.31, rate 499 bps, rounded variable fee $0.22, fixed fee $0.09, charged $0.31.
- Purchase mixed-basket-purchase-4: amount $99.70, rate 499 bps, rounded variable fee $4.98, fixed fee $0.09, charged $5.07.

## Reduction Summary

Purchases: 4 → 4. Purchase total: $141.00 → $106.01. Total late days: 0 → 0.

Cost difference: +$0.52 → +$0.01.

200/200 minimization comparisons; 8 accepted reductions. Termination: budget-exhausted. Budget exhausted: yes.

| Step | Type | Purchases | Purchase total | Late days | Verified difference |
| ---: | --- | --- | --- | --- | ---: |
| 1 | lower-purchase-amount | 4 → 4 | $141.00 → $132.00 | 0 → 0 | +$0.39 |
| 2 | lower-purchase-amount | 4 → 4 | $132.00 → $106.62 | 0 → 0 | +$0.01 |
| 3 | lower-purchase-amount | 4 → 4 | $106.62 → $106.54 | 0 → 0 | +$0.01 |
| 4 | lower-purchase-amount | 4 → 4 | $106.54 → $106.31 | 0 → 0 | +$0.01 |
| 5 | lower-purchase-amount | 4 → 4 | $106.31 → $106.23 | 0 → 0 | +$0.01 |
| 6 | lower-purchase-amount | 4 → 4 | $106.23 → $106.15 | 0 → 0 | +$0.01 |
| 7 | lower-purchase-amount | 4 → 4 | $106.15 → $106.07 | 0 → 0 | +$0.01 |
| 8 | lower-purchase-amount | 4 → 4 | $106.07 → $106.01 | 0 → 0 | +$0.01 |

## Reproduction Information

Proof schema: 1. Engine: stage3-v1. Minimizer: stage4b-v1. Search seed: 20261027.

Recorded Stage 4A search options:

```json
{
  "seed": 20261027,
  "maxEvaluations": 1,
  "maxResults": 1,
  "purchaseCountMin": 4,
  "purchaseCountMax": 4,
  "purchaseAmountCentsMin": 100,
  "purchaseAmountCentsMax": 10000,
  "lateDaysMin": 0,
  "lateDaysMax": 0
}
```

Load the proof JSON and call verifyImpactProof(proof). Original and minimized results are recalculated with compareContracts(oldContract, newContract, scenario). To repeat minimization, use the recorded original witness fields, searchOptions and maxChecks with minimizeWitness.

10 financial comparisons were recomputed when formatting this report. Recorded search provenance and rejected minimization attempts are not authenticated.

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
