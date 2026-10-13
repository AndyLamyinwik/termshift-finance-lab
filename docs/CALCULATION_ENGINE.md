# Calculation Engine

## Stage 3 scope and input boundary

TermShift's Stage 3 engine evaluates Contract v1 against Scenario v1 and compares two contract outcomes for the same scenario. The core is pure TypeScript and can run in Node.js without React, DOM access, a current clock, timezone, random state, network, or backend. It does not mutate the supplied contracts or scenario. No additional dependencies or changes to the Stage 2 input schemas are needed.

The public entry point is `src/engine/index.ts`:

```ts
evaluateContract(contractInput: unknown, scenarioInput: unknown): EngineResult<Evaluation>
compareContracts(
  oldContractInput: unknown,
  newContractInput: unknown,
  scenarioInput: unknown,
): EngineResult<Comparison>
```

Both functions first use the formal Stage 2 `validateContract` and `validateScenario` validators. They accept only the supported USD/calendar-month v1 model: purchase transactions, completed payment events, and at least one of the three named fee rules. The input limits remain 10,000 transactions and 1,000 payment events. Input dates must be real Gregorian dates in years 0001–9999, and purchase dates must belong to the scenario's `billingMonth`. See [FINANCIAL_MODEL.md](FINANCIAL_MODEL.md) for every input field and validation condition.

`effectiveDate` describes a contract version. It does not determine whether an evaluation is allowed. A later contract can be applied to an earlier scenario for counterfactual comparison, as in the existing May 2026 fixtures whose new contracts have June 2026 effective dates.

The engine evaluates only explicit inputs. It does not generate scenarios, search for counterexamples, compare contract text or rule structure, render an analysis interface, or implement Stage 4.

## Units and exact arithmetic

All input and output monetary values are integer USD cents. One USD equals 100 cents. Rates are integer basis points from 0 through 10,000; one basis point is 0.01 percent. These are explicit USD v1 units. Future currency support must define its own minimum-unit scale instead of assuming every currency has two decimal places.

Monetary sums, products, rational division, and signed subtraction use `bigint` internally. Safe integer input numbers are converted directly to exact integers before arithmetic. Binary floating-point multiplication, division, and accumulated sums do not determine monetary results.

Public results contain ordinary numbers only. Each exposed monetary trace value, individual charge, category total, and grand total must lie in:

```text
0 <= value <= Number.MAX_SAFE_INTEGER
Number.MAX_SAFE_INTEGER = 9,007,199,254,740,991
```

Comparison deltas are signed and must lie between `-Number.MAX_SAFE_INTEGER` and `Number.MAX_SAFE_INTEGER`, inclusive. Since successful old/new totals are nonnegative safe integers, their mathematical difference fits this range; the implementation still performs checked conversion after exact subtraction.

Internal products can exceed the safe number range while their rounded monetary result remains valid. For example, `amountCents × rateBps` is a scaled `bigint` numerator, not an exposed cents value, so it is not converted prematurely. A purchase-total waiver trace must expose its actual cents total: if that total is too large, evaluation fails even when the fee would be waived. A transaction-count waiver does not need or calculate that purchase-total trace value.

No public successful result contains `bigint`, `NaN`, `Infinity`, or an unsafe integer. Results can be JSON serialized and parsed without changing their values.

Valid negative-zero inputs are emitted as ordinary zero in numerical traces and totals. This preserves identical JSON round trips without changing the input objects or the Stage 2 schemas.

## Fee formulas

### Monthly fee

The scenario describes one entire calendar billing month. Stage 2 validation already restricts every purchase to that month.

For `minTransactionCount`, let `N` be `scenario.transactions.length`:

```text
waived = N >= threshold
monthlyFeeCents = waived ? 0 : feeCents
```

For `minPurchaseTotalCents`, let `P` be the exact sum of all purchase `amountCents` values:

```text
P = sum(purchase.amountCents)
waived = P >= threshold
monthlyFeeCents = waived ? 0 : feeCents
```

An enabled monthly rule is assessed once, including when there are no transactions or when its fee is zero. Equality satisfies either waiver. The trace records the original fee, waiver kind, threshold, actual count or purchase total, waiver decision, and final charge. If `monthlyFee` is absent, its category total is zero and it has no trace entry.

### Transaction fee and rounding policy

For each purchase independently:

```text
variableFeeCents = roundHalfUp(amountCents × rateBps / 10000)
chargedCents = fixedCents + variableFeeCents
transactionFeeCents = sum(chargedCents for each purchase)
```

`roundHalfUp` applies to an exact nonnegative rational value. Given nonnegative integer numerator `n` and positive integer denominator `d`, integer division gives quotient `q` and remainder `r`:

```text
q = n / d                 // integer division
r = n % d
rounded = q + (2 × r >= d ? 1 : 0)
```

Thus the portion below half a cent rounds down, and a half-cent tie rounds up:

| Exact value | Rounded cents |
| --- | ---: |
| 0.4 cents | 0 |
| 0.5 cents | 1 |
| 0.6 cents | 1 |
| 100 cents × 100 bps / 10000 = 1 cent | 1 |
| 100 cents × 60 bps / 10000 = 0.6 cents | 1 |

Rounding occurs before adding the fixed fee and before summing transactions. Two 100-cent purchases at 60 bps with zero fixed fee produce `1 + 1 = 2` cents. Rounding their combined 200-cent amount would give `roundHalfUp(1.2) = 1` cent; that combined-total policy is not used.

Only purchase transactions supported by Scenario v1 are assessed. If the transaction rule is absent or there are no transactions, its total is zero. An enabled rule with zero rate and zero fixed fee still emits a zero-charge trace for every transaction.

### Completed-payment late fee

Each completed payment event is assessed separately:

```text
lateDays = max(0, ordinal(paidOn) - ordinal(dueOn))
graceExceeded = lateDays > graceDays
chargedCents = graceExceeded ? feeCents : 0
lateFeeCents = sum(chargedCents for each completed payment event)
```

Same-day and early payment have zero late days. A payment exactly `graceDays` late is within the grace period and incurs no charge. Only a strictly greater delay incurs the fee. If the late-fee rule is absent or there are no completed payment events, the total is zero.

The payment amount remains validated scenario metadata. It does not scale the late fee or establish that an account balance has been fully paid. Every payment event is assessed once even when due/paid dates cross the scenario's billing month.

**This is an independent synthetic fee per completed payment event. It does not represent the account-level late-fee model commonly used by real credit cards or real banks' regulatory obligations.** No balances, minimum payments, unpaid events, partial repayment, interest, compounding, fee caps, or financial regulation are implemented.

## Gregorian calendar-day algorithm

Dates are calendar dates, not timestamps. The engine parses the validated year, month, and day, then maps them to a one-based ordinal where `0001-01-01` is day 1.

For year `y`, let `p = y - 1`. The number of days before that year is:

```text
daysBeforeYear = 365 × p + floor(p / 4) - floor(p / 100) + floor(p / 400)
```

Add the days before the month using the common-year offsets:

```text
January    0      February   31      March      59
April     90      May       120      June      151
July     181      August    212      September 243
October  273      November  304      December  334
```

Add one more day when the year is a leap year and the month is after February, then add the day of the month. The Gregorian leap rule is divisibility by 4, except centuries not divisible by 400. This accepts February 29 in 2000 and 2024, and excludes it in 1900 and 2100.

Subtracting ordinals yields the signed calendar-day difference. Late days clamp that difference to zero. Month changes, year changes, leap years, and the full `0001-01-01` through `9999-12-31` range use the same algorithm. Ordinals and their differences are small exact integers within the safe number range. There is no JavaScript `Date` normalization, millisecond arithmetic, 24-hour assumption, daylight-saving adjustment, or system timezone input.

## Public success and failure structures

The public types below are exported from the engine entry point. Every result must be handled by checking `success` before reading `data` or `issues`:

```ts
type EnginePath = (string | number)[]

interface EngineIssue {
  code: 'validation_error' | 'overflow'
  path: EnginePath
  message: string
  validationCode?: string
}

type EngineResult<T> =
  | { success: true; data: T }
  | { success: false; issues: EngineIssue[] }

interface FeeCategoryCents {
  monthlyFeeCents: number
  transactionFeeCents: number
  lateFeeCents: number
}

interface Evaluation extends FeeCategoryCents {
  contractId: string
  contractVersion: string
  scenarioId: string
  currency: 'USD'
  totalCents: number
  trace: CalculationTrace[]
}

interface Comparison {
  oldEvaluation: Evaluation
  newEvaluation: Evaluation
  deltaCents: number
  deltaByCategoryCents: FeeCategoryCents
}
```

The evaluation total is the exact sum of its three category totals. For a successful comparison:

```text
deltaCents = newEvaluation.totalCents - oldEvaluation.totalCents
deltaByCategoryCents.monthlyFeeCents = newMonthlyFee - oldMonthlyFee
deltaByCategoryCents.transactionFeeCents = newTransactionFee - oldTransactionFee
deltaByCategoryCents.lateFeeCents = newLateFee - oldLateFee
```

Positive values mean the new contract costs more in this scenario, negative values mean it costs less, and zero means the calculated cost is unchanged for this scenario. Removing a fee rule gives zero for that new category and can produce a negative delta. Comparing a contract to itself produces zero deltas. The three category deltas sum to the total delta. Equal fees for one scenario do not establish equivalence for every possible scenario.

### Failure handling

Validation failures have `code: 'validation_error'` and preserve the Stage 2 validator's code in `validationCode`. For evaluation, their paths start with `contract` or `scenario`; for comparison, paths start with `oldContract`, `newContract`, or `scenario`. Subsequent string/number segments identify the invalid field or array element. Messages remain readable and deterministic.

Overflow failures have `code: 'overflow'`, a path identifying the unrepresentable output, and a message explaining the safe integer limitation. Comparison prefixes an evaluation's overflow path with `oldEvaluation` or `newEvaluation` so the failing side is explicit.

For example, an oversized first transaction charge reports `['trace', 0, 'chargedCents']` when no monthly entry precedes it. An unsafe purchase-total waiver trace reports `['trace', 0, 'actualPurchaseTotalCents']`. Unsafe category sums report their category field, such as `['transactionFeeCents']`, and an unsafe combined total reports `['totalCents']`. If the new side of a comparison has the latter failure, its path is `['newEvaluation', 'totalCents']`. Trace indexes follow the documented entry order.

Invalid input is rejected before calculation. Valid individual amounts can still cause overflow when fees or purchase totals are summed. A calculation failure returns `issues` and no `data`; no zero substitute, truncated total, or partially successful comparison is supplied. The caller must correct the data or its bounded scenario before retrying. Internal helpers can throw for programmer misuse; the public calculation wrappers convert the expected monetary overflow error to the structured failure. Unexpected programmer errors are not converted into invented successful results.

## Structured calculation traces

`CalculationTrace` is a discriminated union of `MonthlyFeeTrace`, `TransactionFeeTrace`, and `LateFeeTrace`, using `ruleType` as the discriminator. All charge fields are USD cents; rates, counts, and days retain their own units.

The order is stable:

1. One monthly entry when a monthly rule is enabled, including waived or zero fees.
2. One transaction entry per purchase when a transaction rule is enabled, in the original transaction-array order.
3. One late entry per completed payment event when a late rule is enabled, in the original payment-array order.

Missing rules produce no trace entries. Assessed zero charges are retained rather than hidden, preserving evidence of waiver or grace decisions. The exact sum of all trace `chargedCents` values equals `Evaluation.totalCents`, and charges grouped by `ruleType` equal their category totals.

### `MonthlyFeeTrace`

| Field | Meaning |
| --- | --- |
| `ruleType` | Literal `'monthlyFee'`. |
| `originalFeeCents` | The contract's fee before a waiver. |
| `waiverKind` | `'minTransactionCount'` or `'minPurchaseTotalCents'`. |
| `threshold` | Required purchase count or USD cents, selected by `waiverKind`. |
| `actualTransactionCount` | Present only for a transaction-count waiver; the month purchase count. |
| `actualPurchaseTotalCents` | Present only for a purchase-total waiver; the exact, checked month total. |
| `waived` | Whether the actual value meets or exceeds the threshold. |
| `chargedCents` | Zero if waived; otherwise `originalFeeCents`. |

The monthly union exposes the actual value for the applicable waiver only. Consumers should narrow on `waiverKind` before reading that field.

### `TransactionFeeTrace`

| Field | Meaning |
| --- | --- |
| `ruleType` | Literal `'transactionFee'`. |
| `transactionId` | ID of the assessed purchase. |
| `amountCents` | That purchase's input amount. |
| `fixedCents` | Contract's per-purchase fixed charge. |
| `rateBps` | Contract's integer basis-point rate. |
| `variableFeeCents` | Independently half-up rounded proportional charge. |
| `chargedCents` | Checked sum of the fixed and variable charges. |

### `LateFeeTrace`

| Field | Meaning |
| --- | --- |
| `ruleType` | Literal `'lateFee'`. |
| `paymentEventId` | ID of the assessed completed payment. |
| `dueOn` | Input Gregorian due date. |
| `paidOn` | Input Gregorian completion date. |
| `originalFeeCents` | Contract's potential per-event late fee. |
| `lateDays` | Nonnegative calendar-day delay after clamping early payment to zero. |
| `graceDays` | Contract's calendar-day allowance. |
| `graceExceeded` | Whether `lateDays` is strictly greater than `graceDays`. |
| `chargedCents` | `originalFeeCents` if grace is exceeded; otherwise zero. |

A future interface can consume these numerical traces directly. It should not recalculate financial rules from prose or infer unsupported real-world claims.

## Worked formal fixture calculations

The three experiments are the existing formal Stage 2 fixtures in `src/scenarios/experiments.ts`, exported through `src/scenarios/index.ts`. The engine computes their results from their contracts and scenarios. Fixture data contains no embedded expected evaluation answers.

### Experiment A: The Waiver Trap

The scenario contains five purchases of 1,000 cents each in May 2026. The old contract has a 1,200-cent monthly fee and a five-purchase count waiver:

```text
actualTransactionCount = 5
5 >= 5, so waived = true
old monthly fee = 0 cents
```

The new contract keeps the 1,200-cent fee and changes the waiver to a 50,000-cent purchase-total threshold:

```text
actualPurchaseTotalCents = 5 × 1000 = 5000
5000 < 50000, so waived = false
new monthly fee = 1200 cents
delta = 1200 - 0 = +1200 cents
```

Both contracts omit transaction and late rules, so those category totals are zero. Each evaluation has one monthly trace entry.

### Experiment B: The Microtransaction Penalty

The scenario contains ten purchases of 100 cents each. The old contract charges 100 bps and a zero fixed fee:

```text
per-purchase variable = roundHalfUp(100 × 100 / 10000) = 1 cent
per-purchase charge = 0 + 1 = 1 cent
old transaction total = 10 × 1 = 10 cents
```

The new contract charges 60 bps and a 20-cent fixed fee:

```text
per-purchase variable = roundHalfUp(100 × 60 / 10000) = 1 cent
per-purchase charge = 20 + 1 = 21 cents
new transaction total = 10 × 21 = 210 cents
delta = 210 - 10 = +200 cents
```

Each evaluation has ten transaction trace entries. No monthly or late rule is enabled. Rounding the new proportional fee on the combined purchase amount would produce a different total and would violate this engine's per-purchase policy.

### Experiment C: The Grace Period Shift

The synthetic completed payment is due `2026-05-15` and paid `2026-05-17`. Its input amount of 10,000 cents is fictional metadata, not a computed balance. Both contracts have a 1,500-cent late fee:

```text
lateDays = ordinal(2026-05-17) - ordinal(2026-05-15) = 2
old graceDays = 3; 2 > 3 is false; old late fee = 0 cents
new graceDays = 1; 2 > 1 is true; new late fee = 1500 cents
delta = 1500 - 0 = +1500 cents
```

Each evaluation has one late trace entry. No monthly or transaction rule is enabled.

### Fixture outcome summary

| Experiment | Old total (USD cents) | New total (USD cents) | Delta (USD cents) |
| --- | ---: | ---: | ---: |
| The Waiver Trap | 0 | 1,200 | +1,200 |
| The Microtransaction Penalty | 10 | 210 | +200 |
| The Grace Period Shift | 0 | 1,500 | +1,500 |

These outcomes describe fictional experiments under this declared model. They do not rank actual financial products or constitute financial recommendations.

## Usage example

From a file under `src/`:

```ts
import { compareContracts } from './engine'
import { microtransactionPenaltyExperiment } from './scenarios'

const { oldContract, newContract, scenario } = microtransactionPenaltyExperiment
const result = compareContracts(oldContract, newContract, scenario)

if (result.success) {
  console.log(result.data.deltaCents) // 200, computed from the formal inputs
  console.log(JSON.stringify(result.data))
} else {
  for (const issue of result.issues) {
    console.error(issue.path.join('.'), issue.code, issue.message)
  }
}
```

The calculation tests use the formal fixtures as well as financial boundaries for rounding, waivers, Gregorian dates, enabled/absent rule combinations, and overflow. Additional invariants cover input immutability, deterministic results, JSON round trips, trace totals, and category-delta sums. Stage 1 and Stage 2 tests remain part of the same suite.
