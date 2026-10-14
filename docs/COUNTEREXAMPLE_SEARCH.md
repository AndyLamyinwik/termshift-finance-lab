# Counterexample search

Stage 4A adds deterministic, bounded searches for scenarios where two validated contracts produce different fees. It uses the Stage 2 schemas and Stage 3 `compareContracts` API. Every retained witness contains the complete scenario and the actual comparison returned by that engine. Search code does not implement a second fee formula.

The search runs entirely in local TypeScript and can be imported without React, the DOM, a server, or network access. It does not read the current time or use `Math.random`. No dependency is added in this stage. The existing homepage remains informational; no search UI, deployment, or PDF output is included. Stage 4B adds a separate witness minimizer and impact-evidence module without changing this search API or its financial formulas.

## Public API

Import `searchCounterexamples`, `SearchOptionsSchema`, and `validateSearchOptions` from `src/search/index.ts`. The public call accepts untrusted inputs:

```ts
searchCounterexamples(
  oldContractInput: unknown,
  newContractInput: unknown,
  baseScenarioInput: unknown,
  optionsInput: unknown,
): SearchResult
```

The function returns `{ success: true, data: SearchReport }` after a valid search, or `{ success: false, issues: SearchIssue[] }` when an input cannot be used. An unsuccessful input result contains no partial search report. Input objects are never mutated.

Contract and scenario inputs pass through the existing formal validators. Search options use a strict object schema: every field below is required, values must be integers, unknown fields are rejected, and minimum bounds cannot exceed maximum bounds. There are no implicit defaults or coercions.

| Option | Unit and accepted values |
| --- | --- |
| `seed` | Integer from 0 through 4,294,967,295, inclusive. |
| `maxEvaluations` | Maximum calls to `compareContracts`, from 1 through 500. |
| `maxResults` | Maximum retained witnesses, from 1 through 10. |
| `purchaseCountMin`, `purchaseCountMax` | Inclusive purchase count bounds, each from 0 through 30. |
| `purchaseAmountCentsMin`, `purchaseAmountCentsMax` | Inclusive amount per generated purchase, each from 1 through 100,000 USD cents. |
| `lateDaysMin`, `lateDaysMax` | Inclusive payment delay bounds, each from 0 through 31 calendar days. |

Search adds tighter capacity limits than the general Stage 2 scenario schema: a base scenario may contain at most 30 purchases and five payment events. An oversized input is rejected with `capacity_exceeded`; data is never silently truncated. Existing supported rule parameters remain governed by the Stage 2 schemas, even when their thresholds fall outside the selected search range.

Issues expose `code`, `path`, and a readable `message`. Formal validation issues retain their validator code. Input paths begin with `oldContract`, `newContract`, `baseScenario`, or `options`. Codes distinguish `validation_error`, `capacity_exceeded`, `candidate_date_out_of_range`, and engine `overflow`. Invalid generated scenarios and comparison failures are recorded in the candidate ledger so the failure remains traceable. A candidate record supplies its ID, sequence, source, and parameters as context for its issue paths; engine issues retain their original Stage 3 paths.

## Generated scenario family

The generated family is deliberately small: `uniform-purchases-shared-delay`.

- A candidate has an integer number of purchases, all with the same positive amount in USD cents. Purchase dates are the first day of the base `billingMonth`; generated IDs are legal and unique.
- Existing payment events keep their original IDs, due dates, and amounts. Each candidate applies one shared `lateDays` value to all of them, computing `paidOn` from the original `dueOn`.
- A scenario with no payment events remains without payment events. The search cannot invent a payment obligation.
- The billing month and other scenario metadata come from the validated base scenario. Generated arrays and records are new objects.

Payment dates use explicit Gregorian calendar stepping, with Stage 2's years 0001 through 9999. Delays can cross months, years, and leap days. A delay beyond `9999-12-31` fails generation and is logged; dates are not repaired or wrapped. Every generated scenario passes the formal Scenario validator before comparison.

The valid, in-range base scenario is considered first. Its purchases may have different amounts and its payments may have different delays, so it can be an additional explicit scenario outside the generated family. A valid base outside the requested bounds is recorded as `out_of_range` and skipped. Its arrays must still satisfy the search capacity limits. For the base's range check, early payment uses the calculation engine's effective delay of zero: it can be evaluated when zero is allowed, but it does not contribute to the generated nonnegative-delay family's coverage.

There are no generated nonuniform purchase combinations, independent per-payment delays, new obligations, unpaid balances, interest, partial repayment, or date-dependent account behavior. These restrictions define the search's scope rather than changing the financial formulas.

## Boundary Explorer

Boundary candidates are derived from the two actual contracts. The explorer prioritizes nearby parameters where an enabled rule can change behavior:

| Rule information | Derived candidate values |
| --- | --- |
| Purchase-count waiver threshold | The threshold, one count below it, and one count above it. |
| Purchase-total waiver threshold | For each allowed nonzero count, amounts near the floor and ceiling of threshold divided by count, including adjacent integer cents. |
| Grace period | The grace period and adjacent delays. |
| Transaction fixed fees and rates | Amounts near the proportional-fee crossover between contracts and near half-cent rounding transitions, with neighboring integer cents. |

The explorer also uses deterministic anchors and inclusive range endpoints to connect these parameters. It visits the sparse count, transaction-fee, and grace-period boundaries before the more numerous purchase-total subdivisions, then the small anchor product. Half-cent candidates are sampled near the allowed amount endpoints, the base amount, and the nominal crossover; it does not enumerate every rounding transition. Rate-derived candidates use integer `bigint` arithmetic so boundary derivation does not introduce floating-point monetary rounding. These calculations only choose input values; `compareContracts` alone calculates actual fees and deltas.

Only candidates within all user-selected bounds can reach comparison. A contract threshold beyond the range does not expand the range. The explorer is lazy and limits its output to 512 candidate attempts; it never materializes the full Cartesian product. Roughly half of the evaluation budget remaining after the base is reserved for boundary exploration, leaving capacity for seeded exploration. Filling `maxResults` does not stop the search, because a later candidate may have a larger difference or the opposite direction.

## Seeded Scenario Explorer

The random portion uses a local 32-bit linear congruential generator. Its state starts from the explicit `seed`, and each step is:

```text
state = (1664525 × state + 1013904223) modulo 2^32
```

The implementation uses `Math.imul` and unsigned 32-bit conversion. An inclusive integer is selected as `min + nextUint32() % (max - min + 1)`. Modulo selection has a small distribution bias; this generator is intended for bounded, reproducible exploration, not cryptography or a statistical coverage guarantee.

Each candidate draw chooses count, purchase amount, and shared payment delay in a fixed order. The PRNG instance belongs to one call, with no global mutable state. Repeating the same validated contracts, base scenario, options, seed, and implementation produces identical candidate order, ledger, witnesses, and counts. Changing the seed can change the seeded selection and order; it cannot create extra distinct choices in a singleton range.

Seeded exploration permits at most `maxEvaluations × 4` attempts, up to 2,000. Duplicate draws do not spend evaluation budget, but they still count against this attempt limit. Whenever budget remains after boundary exploration, the seeded portion actually draws a candidate, even when a tiny generated space has already been covered. A budget of one may be consumed entirely by the base.

To reproduce a report, save the complete inputs and options and rerun this API at the same code revision. Candidate IDs, sequences, sources, and optional generated parameters provide stable identifiers within that report. The seed is only one part of the reproduction input.

## Deduplication, budget, and coverage

Deduplication uses content relevant to the current engine: ordered purchase amounts and ordered payment due dates, paid dates, and amounts. Candidate IDs and purchase dates within the same billing month do not change current fee results and are excluded from this identity. A duplicate is logged with `duplicateOf` and is never compared again. If future formulas depend on more fields, this identity must change with them.

`evaluatedCount` is the number of actual `compareContracts` calls, including calls that fail. It cannot exceed `maxEvaluations`. `sourceEvaluations` breaks that count down into `base`, `boundary`, and `seeded`. `skippedCount` counts attempts rejected before comparison, such as duplicates, out-of-range bases, and invalid generated dates or scenarios. `failedCount` separately counts engine comparison failures. An overflow is a failed comparison with retained issues, never a zero delta or a witness.

The ledger can contain at most 2,513 records: one base attempt, at most 512 boundary attempts, and at most 2,000 seeded attempts. Every candidate contains at most 30 purchases and five payments. These explicit attempt and array limits bound work even when the amount range is large or random draws repeat.

`budgetExhausted` means `evaluatedCount === maxEvaluations`. `stopReason` is one of `budget`, `space-covered`, or `attempt-limit`. Hitting the attempt limit can end a partial search without exhausting evaluation budget.

Coverage describes only the generated uniform-purchase/shared-delay family. `generatedSpaceSize` is the number of distinct parameter tuples in that bounded family; `visitedParameterCount` counts distinct tuples attempted. Zero purchases canonicalize the irrelevant purchase amount to one choice, and no payment events canonicalize the irrelevant delay to one choice. An in-range base contributes to coverage only if it exactly represents a tuple in this family. Nonuniform base scenarios can be evaluated without enlarging that family's coverage claim.

`coverage.complete` is true only when every canonical tuple has been visited, including explicit logged attempts whose payment dates are outside the Gregorian range. It does not claim all scenarios were financially evaluated when candidates failed, and it does not cover nonuniform scenarios or independent payment delays. The search reports observed coverage, not a percentage inferred from the evaluation budget. Large ranges normally remain partially sampled.

## Result and witness structure

The successful `SearchReport` contains:

| Field | Meaning |
| --- | --- |
| `seed`, `searchOptions`, `maxEvaluations` | The validated, explicit search configuration. |
| `evaluatedCount`, `skippedCount`, `failedCount` | Actual comparison calls, pre-comparison skips, and comparison failures. |
| `budgetExhausted`, `stopReason` | Why the bounded run ended and whether its comparison budget was consumed. |
| `status`, `message` | `witnesses-found` or `no-witness-found`, with a scoped explanation. |
| `witnesses` | Up to `maxResults` retained nonzero comparisons. |
| `coverage` | Method, generated family, space size, visited tuple count, and completeness. |
| `sourceEvaluations` | Actual comparison counts per candidate source. |
| `candidates` | Ordered ledger of evaluated, failed, duplicate, out-of-range, and invalid-scenario attempts. |

Each witness includes `candidateId`, `sequence`, `source`, optional `parameters`, the complete `scenario`, the engine's complete `comparison`, and `deltaCents`. The invariant is:

```text
witness.deltaCents === witness.comparison.deltaCents
witness.deltaCents !== 0
```

Positive deltas mean the new contract costs more; negative deltas mean it costs less. Witnesses are ranked by descending absolute delta and then ascending candidate sequence. When `maxResults` is at least two and both signs were observed, selection preserves the strongest positive and strongest negative representatives before filling the remaining capacity with the strongest observed candidates. With capacity one, the strongest absolute difference wins.

All public data contains JSON-safe values. Internal integer boundary arithmetic never exposes a `bigint`. A saved report can therefore be serialized together with its complete scenarios and comparison traces.

## Interpreting findings

A witness demonstrates a fee difference for its explicit scenario under the current supported rules. The strongest retained witness is the largest observed difference in this run; it is not a claim about the global maximum.

`no-witness-found` means **no witness was found within the specified search range and budget**. It does not establish general contract equivalence. Even complete coverage only describes the simplified generated family, and logged invalid scenarios or engine failures must still be considered. Contract `effectiveDate` remains descriptive and does not block counterfactual comparisons.

Stage 4A retains full discovered scenarios. Its search API does not minimize purchases, amounts, payment delays, or explanatory traces. Stage 4B consumes a selected witness and its recorded options through `minimizeWitness` and `createImpactProof`; it preserves existing payment obligations, and reports reduction under a finite strategy and budget without claiming a globally smallest counterexample. See [MINIMIZATION_AND_PROOF.md](MINIMIZATION_AND_PROOF.md).

A proof's search options and source metadata make the submitted inputs reproducible. Proof verification checks current financial and reduction consistency, rather than authenticating a past search execution or certifying the search ledger. In particular, `coverage.complete` means all canonical parameter combinations were visited and can include failed date generation or financial comparisons; it never certifies that all those combinations were successfully evaluated.

## Formal experiment searches

The example inputs use the unchanged Stage 2 contract fixtures. For Waiver Trap and Microtransaction Penalty, the base copies the fixture scenario with `transactions: []`. For Grace Period Shift, the base copies its payment with `paidOn: dueOn`. Each base first compares at zero delta; results are discovered by the search rather than inserted into fixture data.

```ts
const options = {
  seed: 20260401,
  maxEvaluations: 120,
  maxResults: 5,
  purchaseCountMin: 0,
  purchaseCountMax: 10,
  purchaseAmountCentsMin: 100,
  purchaseAmountCentsMax: 1000,
  lateDaysMin: 0,
  lateDaysMax: 5,
}
```

The base construction and call are the same for all three formal fixtures:

```ts
for (const experiment of experiments) {
  const baseScenario = {
    ...experiment.scenario,
    transactions: [],
    paymentEvents: experiment.scenario.paymentEvents.map((event) => ({
      ...event,
      paidOn: event.dueOn,
    })),
  }
  const result = searchCounterexamples(
    experiment.oldContract,
    experiment.newContract,
    baseScenario,
    options,
  )
  // Inspect result.success before reading result.data.
}
```

These measured runs used the implementation's real search and comparison APIs, with the options above:

| Experiment | Base delta (cents) | Seed | Evaluations | Retained witnesses | Skipped | Failed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| The Waiver Trap | 0 | 20260401 | 120 | 5 | 29 | 0 |
| The Microtransaction Penalty | 0 | 20260401 | 120 | 5 | 27 | 0 |
| The Grace Period Shift | 0 | 20260401 | 120 | 5 | 18 | 0 |

The strongest retained candidates were:

| Experiment | Candidate / source | Purchase count | Amount per purchase (cents) | Shared late days | Old total (cents) | New total (cents) | Delta (cents) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| The Waiver Trap | `boundary-3` / boundary | 5 | 100 | 0 | 0 | 1,200 | +1,200 |
| The Microtransaction Penalty | `boundary-1` / boundary | 10 | 149 | 0 | 10 | 210 | +200 |
| The Grace Period Shift | `boundary-1` / boundary | 10 | 100 | 2 | 0 | 1,500 | +1,500 |

Waiver Trap's discovered five purchases total 500 cents: the engine waives the old count-based fee and charges the new total-based fee. Microtransaction Penalty's 149-cent purchases are generated near a rate-derived rounding transition, not copied from the original 100-cent fixture scenario. Grace Period Shift preserves `grace-payment-1`, its `2026-05-15` due date, and its 10,000-cent amount, and generates payment on `2026-05-17`. Its ten purchases have no fee effect under the late-fee-only contracts; they remain in the full witness because this stage does not minimize scenarios.

The actual comparison allocation and generated-family coverage were:

| Experiment | Base evaluations | Boundary evaluations | Seeded evaluations | Visited tuples | Generated space size | Complete |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| The Waiver Trap | 1 | 10 | 109 | 120 | 9,011 | false |
| The Microtransaction Penalty | 1 | 16 | 103 | 120 | 9,011 | false |
| The Grace Period Shift | 1 | 13 | 106 | 120 | 54,066 | false |

All three report `status: 'witnesses-found'`, `budgetExhausted: true`, and `stopReason: 'budget'`. They are partial searches, and the seeded explorer actually contributes comparisons in each run. The five witnesses are the retained result count, not a claim that only five nonzero comparisons were encountered. These sample outputs belong in documentation and tests; the search algorithm and fixtures contain no prefilled experiment answers.

## Validation and tests

Node.js tests preserve the existing model and engine suites and exercise the formal zero-delta experiments, deterministic ordering, seeded variation, formal candidate validation, budget and result limits, deduplication, scoped no-witness results, both delta directions, overflow, date boundaries, input immutability, and JSON serialization. Witness comparisons are checked against fresh calls to the public Stage 3 API.

Run the same checks used by CI:

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```
