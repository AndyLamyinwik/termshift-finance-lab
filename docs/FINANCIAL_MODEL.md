# Financial Model

## Stage 2 scope

TermShift Stage 2 defines serializable inputs for later financial contract experiments. It includes Contract v1, three financial rule structures, Scenario v1, runtime validation, and three synthetic experiment fixtures. These modules contain data and validation only. They do not calculate fees, compare outcomes, discover counterexamples, or provide analysis results.

The public API is exported from `src/models/index.ts`. `ContractSchema` and `ScenarioSchema` validate the complete v1 inputs; `Contract` and `Scenario` are the corresponding inferred TypeScript types. The entry point also exports the primitive schemas, `WaiverSchema`, the three rule schemas, `FinancialRulesSchema`, `TransactionSchema`, and `PaymentEventSchema` for direct validation of individual structures. Schemas and types are independent of React and browser APIs. Zod is the runtime validation dependency; TypeScript types alone do not validate external data.

## Common validation rules

Every model object is strict, including nested rule, waiver, transaction, and payment objects. Unknown properties are rejected instead of silently removed. Required fields must be present, and values are not coerced or implicitly trimmed. For example, `"1200"` is not accepted as `1200`, and `"1"` is not accepted as `schemaVersion: 1`.

| Value | Validation and unit |
| --- | --- |
| ID | ASCII string matching `^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$`: 1–64 characters, first character a letter or digit, remaining characters letters, digits, underscores, or hyphens. Empty strings, whitespace, punctuation outside this set, and leading underscores or hyphens are invalid. |
| Contract name | String of 1–120 characters containing at least one non-whitespace character. |
| Contract version | Complete Semantic Version string, at most 128 characters, with `major.minor.patch` and optional prerelease/build metadata. Leading zeros in numeric core components or numeric prerelease identifiers are invalid. For example, `1.0.0` and `1.0.0-rc.1+lab` are valid; `v1.0.0`, `1.0`, and `01.0.0` are invalid. |
| Nonnegative cents | Integer from 0 through `Number.MAX_SAFE_INTEGER`, inclusive. All current amount fields are USD cents. |
| Positive cents | Integer from 1 through `Number.MAX_SAFE_INTEGER`, inclusive. |
| Positive count | Integer from 1 through `Number.MAX_SAFE_INTEGER`, inclusive; units are a number of purchases. |
| Nonnegative calendar days | Integer from 0 through `Number.MAX_SAFE_INTEGER`, inclusive. |
| Basis points | Integer from 0 through 10,000, inclusive; 1 basis point is 0.01 percent. |
| Calendar date | Exact `YYYY-MM-DD` format with Gregorian year 0001–9999 and a real month/day combination. |
| Billing month | Exact `YYYY-MM` format with year 0001–9999 and month 01–12. |

All numeric fields reject `NaN`, positive or negative infinity, decimals, and unsafe integers. No field represents a floating-point monetary result. All future calculations need their own checked arithmetic and rounding policies; accepting safe inputs does not prove a later sum or product will be safe.

USD is the only supported currency in v1. One USD equals 100 cents. Future currencies must specify their own minimum-unit scale; this model does not assume every currency has two decimal places.

Calendar validity is checked using explicit Gregorian arithmetic, including the century leap-year rule. For example, `2024-02-29` and `2000-02-29` are valid, while `2026-02-30`, `1900-02-29`, and `0000-01-01` are invalid. Validation does not use JavaScript `Date` rollover to repair an invalid input. Dates have no time, offset, or timezone component. Later calculations will compare calendar days rather than timestamps.

## Contract v1

| Field | Required | Meaning and validation |
| --- | --- | --- |
| `schemaVersion` | Yes | Literal number `1`. Other versions are unsupported. |
| `id` | Yes | Contract identifier satisfying the common ID rule. |
| `name` | Yes | Human-readable nonblank contract name, 1–120 characters. |
| `version` | Yes | Complete Semantic Version describing this contract version. |
| `currency` | Yes | Literal `"USD"`. |
| `billingCycle` | Yes | Literal `"calendar-month"`. |
| `effectiveDate` | Yes | Valid `YYYY-MM-DD` date describing the contract version. |
| `rules` | Yes | Strict object containing at least one of `monthlyFee`, `transactionFee`, or `lateFee`. |

`effectiveDate` is descriptive metadata in Stage 2. There is no validation relationship between it and a scenario's billing month or event dates. A counterfactual experiment may deliberately apply a newer contract to an earlier scenario. The fixture contracts use later effective dates to preserve that distinction.

The rule keys are optional individually, so a contract may enable one, two, or all three supported rules. An empty `rules` object is invalid. Unknown rule keys or a generic unknown rule kind are rejected. A supplied rule must have its complete required shape; `null` is not an enabled rule.

### Monthly fee

| Field | Meaning and validation |
| --- | --- |
| `feeCents` | Nonnegative safe integer USD cents. |
| `waiver` | Required strict discriminated union, selected by its `kind` field. |

The waiver has exactly one of the following forms:

| `waiver.kind` | `waiver.threshold` | Intended later meaning |
| --- | --- | --- |
| `"minTransactionCount"` | Positive safe integer purchase count. | At least this many purchase transactions in the billing month. |
| `"minPurchaseTotalCents"` | Positive safe integer USD cents. | At least this total purchase amount in the billing month. |

`kind` is required. Unknown kinds, zero thresholds, fractional thresholds, and additional waiver fields are invalid. Stage 2 validates the threshold and its unit; it does not determine whether a waiver applies.

### Transaction fee

| Field | Meaning and validation |
| --- | --- |
| `fixedCents` | Required nonnegative safe integer USD cents. |
| `rateBps` | Required integer rate from 0 through 10,000 basis points. |

For context, 100 basis points expresses 1 percent and 60 basis points expresses 0.60 percent. These are rate descriptions, not calculated fees. How a future engine combines rates, fixed amounts, and rounding belongs to a later stage.

### Late fee

| Field | Meaning and validation |
| --- | --- |
| `feeCents` | Required nonnegative safe integer USD cents. |
| `graceDays` | Required nonnegative safe integer count of calendar days. |

Stage 2 stores the grace period without assessing whether a completed payment is late or applying a fee.

## Scenario v1

| Field | Required | Meaning and validation |
| --- | --- | --- |
| `schemaVersion` | Yes | Literal number `1`. |
| `id` | Yes | Scenario identifier satisfying the common ID rule. |
| `billingMonth` | Yes | Valid `YYYY-MM` calendar month. |
| `transactions` | Yes | Array of 0–10,000 purchase transactions. |
| `paymentEvents` | Yes | Array of 0–1,000 completed payment events. |

Both arrays must be present, even when empty. Their upper bounds keep input validation and later local experiments bounded. An oversized array is rejected before its elements are parsed. These are v1 input limits, not guarantees about the cost of a future search or simulation.

### Transaction

| Field | Meaning and validation |
| --- | --- |
| `id` | Required valid ID, unique within the scenario's `transactions` array. |
| `occurredOn` | Required Gregorian `YYYY-MM-DD` date whose year and month equal `billingMonth`. |
| `amountCents` | Required positive safe integer USD cents. Zero-value purchases are invalid. |
| `kind` | Required literal `"purchase"`; refunds, transfers, and other transaction kinds are unsupported. |

### Completed payment event

| Field | Meaning and validation |
| --- | --- |
| `id` | Required valid ID, unique within the scenario's `paymentEvents` array. |
| `dueOn` | Required Gregorian `YYYY-MM-DD` due date. It is not restricted to `billingMonth`. |
| `paidOn` | Required Gregorian `YYYY-MM-DD` date on which payment completed. It is not restricted to `billingMonth`. |
| `amountCents` | Required positive safe integer USD cents. |

Early payment is valid: `paidOn` can precede `dueOn`. A payment can also be completed after its due date or across month or year boundaries. The data model records a completed payment; it does not assert that the amount satisfies a balance, minimum payment, or other obligation. There is no unpaid, pending, partially repaid, interest, or compounding model in Stage 2.

Duplicate IDs are rejected independently in the two arrays. The same string may be used once as a transaction ID and once as a payment ID, since they are separate collections.

## Safe runtime validation

Use `validateContract` or `validateScenario` when an input has type `unknown`. Public schemas also allow consumers to perform schema parsing directly. The safe functions return a discriminated result:

```ts
type ValidationResult<T> =
  | { success: true; data: T }
  | {
      success: false;
      issues: Array<{
        path: Array<string | number>;
        code: string;
        message: string;
      }>;
    }
```

For example, from a file under `src/`:

```ts
import { validateContract } from './models'
import { waiverTrapExperiment } from './scenarios'

const input: unknown = waiverTrapExperiment.oldContract
const result = validateContract(input)

if (result.success) {
  const contract = result.data
  console.log(contract.id)
} else {
  for (const issue of result.issues) {
    console.error(issue.path.join('.'), issue.code, issue.message)
  }
}
```

An issue path locates a field or array element, such as `['transactions', 2, 'occurredOn']`. A root-level issue may have an empty path. Codes and messages explain the failed validation; consumers can use the structured path to associate an issue with an input field. Callers should branch on `success` before reading `data` or `issues`.

No validator reads the current date, system timezone, random state, or network. Identical input produces the same success data or ordered issues. Valid contracts and scenarios can be JSON serialized, parsed as `unknown`, and revalidated without losing the v1 field types or units.

## Synthetic experiments

The fixtures in `src/scenarios/` are exported through `src/scenarios/index.ts` as `waiverTrapExperiment`, `microtransactionPenaltyExperiment`, `gracePeriodShiftExperiment`, and the `experiments` collection. Each experiment contains `id`, `name`, `description`, `oldContract`, `newContract`, and `scenario`. This experiment container is fixture metadata; its two contracts and scenario are the inputs to the public v1 validators.

All names, rules, transaction records, and payment records are fictional. They do not represent a real financial product, person, account, transaction, or financial recommendation. Descriptions express the intended experiment setup and contain no simulated outcome.

All three scenarios use `billingMonth: "2026-05"`. Old contracts have `effectiveDate: "2026-01-01"`, and new contracts have `effectiveDate: "2026-06-01"`. The later new-contract date is intentionally allowed for counterfactual data and does not invalidate a May scenario.

| Experiment | Old contract data | New contract data | Scenario data |
| --- | --- | --- | --- |
| The Waiver Trap | Monthly fee 1,200 cents; waiver kind `minTransactionCount`, threshold 5 purchases. | Monthly fee 1,200 cents; waiver kind `minPurchaseTotalCents`, threshold 50,000 cents. | Five May purchases, each 1,000 cents; no payment events. |
| The Microtransaction Penalty | Transaction fixed fee 0 cents; rate 100 basis points. | Transaction fixed fee 20 cents; rate 60 basis points. | Ten May purchases, each 100 cents; no payment events. |
| The Grace Period Shift | Late fee 1,500 cents; grace period 3 calendar days. | Late fee 1,500 cents; grace period 1 calendar day. | No purchase transactions; one completed payment due `2026-05-15`, paid `2026-05-17`, amount 10,000 cents. |

The Grace Period Shift payment amount is an explicit fictional fixture value, not a computed balance. Every experiment's old contract, new contract, and scenario is validated in runtime tests. The fixture names do not claim which contract is preferable, whether a fee is incurred, or the magnitude of any impact. Those questions require a later calculation engine.

## Version boundaries and future work

Contract v1 and Scenario v1 accept only their specified structures. Supporting a new currency, transaction kind, payment state, billing cycle, or financial rule requires an explicit model change and validation decisions. Older payloads are not silently upgraded.

Later stages can consume validated data through the public model entry point. They must separately define fee evaluation, safe arithmetic, rounding, date comparisons, comparison traces, and bounded scenario search. Stage 2 creates no engine, extension framework, mock API, backend, database, or deployment workflow.
