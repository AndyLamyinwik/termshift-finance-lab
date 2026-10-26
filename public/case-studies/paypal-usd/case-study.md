# PayPal US domestic USD: published-plan comparison

A = Checkout (3.49% + USD 0.49). B = Static Micropayments model (4.99% + USD 0.09). These are two published schedules, not old/new prices or real account transactions.

Observed 2026-10-27 (Asia/Shanghai); fee page shows last updated 2026-10-01. [Official fee page](https://www.paypal.com/us/business/paypal-business-fees) · [Micropayments terms](https://www.paypal.com/us/legalhub/paypal/useragreement-full#micropayments) · [Structured source record](source-capture.json).

B assumes a previously approved Static account and an eligible payment type. Dynamic Micropayments instead chooses the lower applicable fee for each transaction. Static is not guaranteed to be available and PayPal may convert accounts to Dynamic. Domestic means both parties are registered or identified as residents of the same market; here that market is US.

TermShift assumes proportional fees are rounded half up to cents per transaction, followed by a fixed fee. This is not a verified PayPal rounding policy. Excludes cross-border, currency conversion, refunds/reversals, disputes/chargebacks, negotiated rates, taxes and other products. Transactions and contract metadata are synthetic. No account access, eligibility confirmation, or financial advice.

![Sampled engine fee curve](fee-curve.svg)

The lines connect sampled engine results; exact rounded fees are listed below. USD 26.66 and 26.67 both produce ties under this model: an unrounded intersection is not a unique rounded switch point.

| Scenario | Independent A | Engine A | Independent B | Engine B | B − A |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 × USD 1.00 | $0.52 | $0.52 | $0.14 | $0.14 | -$0.38 |
| 1 × USD 5.00 | $0.66 | $0.66 | $0.34 | $0.34 | -$0.32 |
| 1 × USD 10.00 | $0.84 | $0.84 | $0.59 | $0.59 | -$0.25 |
| 1 × USD 20.00 | $1.19 | $1.19 | $1.09 | $1.09 | -$0.10 |
| 1 × USD 26.66 | $1.42 | $1.42 | $1.42 | $1.42 | $0.00 |
| 1 × USD 26.67 | $1.42 | $1.42 | $1.42 | $1.42 | $0.00 |
| 1 × USD 30.00 | $1.54 | $1.54 | $1.59 | $1.59 | +$0.05 |
| 1 × USD 100.00 | $3.98 | $3.98 | $5.08 | $5.08 | +$1.10 |
| 10 × USD 1.00 | $5.20 | $5.20 | $1.40 | $1.40 | -$3.80 |
| USD 1 + 10 + 30 + 100 | $6.88 | $6.88 | $7.40 | $7.40 | +$0.52 |

Expectations are fixed independently calculated integer-cent values, checked against the official engine and a separate reference calculator in tests. Fixed fees and rounding apply per receipt: splitting one USD 10 receipt into ten USD 1 receipts changes A from USD 0.84 to USD 5.20 and B from USD 0.59 to USD 1.40.

## Reproducible evidence

Every nonzero listed scenario has a formal Proof Schema v1 file, created from a real one-evaluation base-witness search and independently verified. Import its JSON through the main app → Proof of Impact → Import Proof JSON. JSON uses oldContract/newContract as legacy field names for A/B. The reports explicitly label A/B and explain original versus minimized evidence. Equal-fee scenarios are in results.json; they are not fabricated nonzero counterexamples.

- 1 × USD 1.00: [Proof JSON](usd-1-proof.json) · [Markdown report](usd-1-report.md)
- 1 × USD 5.00: [Proof JSON](usd-5-proof.json) · [Markdown report](usd-5-report.md)
- 1 × USD 10.00: [Proof JSON](usd-10-proof.json) · [Markdown report](usd-10-report.md)
- 1 × USD 20.00: [Proof JSON](usd-20-proof.json) · [Markdown report](usd-20-report.md)
- 1 × USD 30.00: [Proof JSON](usd-30-proof.json) · [Markdown report](usd-30-report.md)
- 1 × USD 100.00: [Proof JSON](usd-100-proof.json) · [Markdown report](usd-100-report.md)
- 10 × USD 1.00: [Proof JSON](ten-usd-1-proof.json) · [Markdown report](ten-usd-1-report.md)
- USD 1 + 10 + 30 + 100: [Proof JSON](mixed-basket-proof.json) · [Markdown report](mixed-basket-report.md)

[Complete scenarios, comparisons, expectations and chart data](results.json). Source data is recorded separately and is not authenticated by Proof Verified.
