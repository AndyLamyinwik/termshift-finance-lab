# Counterexample minimization and Proof of Impact

Stage 4B reduces a real Stage 4A witness to a simpler explanation of a fee difference, and packages the inputs, calculations, and accepted reductions as verifiable evidence. All financial results come from the unchanged Stage 3 `compareContracts` API. The modules are pure TypeScript, independent of React, browser APIs, clocks, timezones, randomness, and network services. They introduce no dependency, new UI, PDF output, or Stage 5 functionality.

The contracts and transactions in the formal examples are entirely fictional. An impact proof describes calculations under this project's supported rules; it is not a bank statement, cryptographic signature, immutable record, or financial regulatory certification.

## Public APIs and input validation

Import `minimizeWitness`, `MinimizationOptionsSchema`, `WitnessSchema`, and the public result types from `src/minimizer/index.ts`:

```ts
minimizeWitness(
  oldContractInput: unknown,
  newContractInput: unknown,
  witnessInput: unknown,
  searchOptionsInput: unknown,
  minimizationOptionsInput?: unknown,
): EvidenceResult<MinimizationResult>
```

The first four arguments are required. The last argument can be omitted, or can be a strict object containing `maxChecks`. Omission or `{}` uses 200 checks. Explicit `maxChecks` must be an integer from 1 through 300. Unknown fields and invalid numerical values fail without coercion.

The minimizer validates both contracts with the formal Contract v1 schema. It validates the full Stage 4A witness: candidate ID, sequence, source, optional generated parameters, Scenario v1, complete old/new evaluation traces, category deltas, and total delta. Scenario capacities are 30 purchases and five payment events, matching Stage 4A's tighter limits. Oversized arrays are rejected before parsing their elements. Comparison traces are bounded to the maximum 36 entries for those capacities: one monthly fee entry, 30 transaction entries, and five late-fee entries.

Search options use the existing strict `SearchOptionsSchema`; all Stage 4A fields, including the seed and inclusive bounds, remain required. The original witness must be inside those bounds. Every candidate purchase count and amount, and every effective payment delay, must stay inside them. Effective delay is `max(0, calendarDaysBetween(dueOn, paidOn))`, so an existing early payment is in range only when zero is permitted.

Before simplification, the minimizer calls `compareContracts` again. It compares the entire recomputed comparison, including traces and category totals, with the recorded witness comparison, independent of object property order. The separate witness delta must also agree. A zero delta fails even when all recorded data is consistent. The witness's stored financial answer is never used as an unchecked premise.

## Objective and preserved data

The objective is this ordered tuple:

```text
(purchase count, total purchase cents, total nonnegative payment late days)
```

The comparison is lexicographic: purchase count has the highest priority; purchase total breaks a count tie; late days break a count-and-total tie. Purchase amounts are integer USD cents. Each payment's late days use Gregorian calendar days rather than timestamps, clamped at zero before summing.

An accepted candidate must strictly improve that objective and satisfy all of these constraints:

- Its comparison succeeds, its delta remains nonzero, and its sign matches the original delta.
- The same two contracts are used. Scenario identity and `billingMonth` remain unchanged.
- Retained purchases preserve original order, IDs, occurrence dates, and `kind`. Purchases can be removed, or have amounts lowered; their amounts cannot be raised.
- Existing payment events retain order, count, IDs, due dates, and obligation amounts. Payment obligations cannot be added or deleted.
- A late paid date can only move toward its original due date; it cannot become earlier than that date. An already early payment retains its paid date unchanged.
- The complete candidate passes the formal Scenario v1 schema and the recorded Stage 4A bounds.

Preserving direction does not require preserving the absolute delta. Removing redundant purchases can reduce a positive difference from 200 cents to 20 cents while retaining the counterexample. Zero difference or a sign reversal is rejected.

Reduced scenarios may contain different purchase amounts or independent payment delays. This remains valid under Scenario v1 and the inclusive search bounds, even when the reduced scenario lies outside Stage 4A's generated uniform-purchase/shared-delay family. This is an explicit local simplification of a discovered witness, rather than a new claim about that family's coverage.

## Fixed reduction strategy and budget

The strategy visits candidates in a deterministic order:

1. Try removing the largest allowed consecutive purchase group, then smaller groups obtained by halving the group size, scanning left to right. Accepted removals revisit the same position in the shorter sequence. The last group size is one, so individual deletion probes are included.
2. Try reducing every retained purchase to the allowed lower amount bound together, then try lower amounts for each purchase in order.
3. For each payment in order, try each permitted nonnegative delay below its current delay, beginning with the lower delay bound.
4. Repeat that priority sequence when a pass accepted a change and budget remains. A later amount or delay change can make another purchase removal possible.

For a purchase's amount interval of at most 32 cents, smaller amounts are enumerated in ascending order. A larger interval uses a fixed finite set: eight values near each edge and dyadic interior probes with denominators 2, 4, 8, and 16, then sorts and deduplicates them. Each candidate is independently evaluated. Failure at a small amount never implies that an untested larger amount would fail; fee differences can be nonmonotonic because of waiver boundaries and per-transaction rounding.

Candidate identity includes the complete scenario data. A previously compared scenario does not spend the comparison budget again. Invalid or out-of-range candidates are rejected before comparison. Engine failures, including overflow, consume one comparison and are recorded with structured issues; they never become zero deltas or accepted reductions. Payment date stepping uses bounded Gregorian arithmetic and rejects an out-of-range year instead of normalizing a date.

`checksPerformed` counts actual minimizer calls to `compareContracts`, including the original witness verification and any failed candidate calculation. It never exceeds `maxChecks`. A budget of one can return the verified original witness without any reductions. Proof creation invokes the minimizer; subsequent proof verification performs its own recomputations and is not charged to the minimization budget.

When the budget is consumed, the best valid result found so far is returned with `budgetExhausted: true` and `terminationReason: 'budget-exhausted'`. Otherwise, the fixed strategy ends with `'strategy-complete'`. The finite candidate sets and a hard maximum of 300 comparison calls prevent unbounded evaluation. Each accepted step also strictly decreases a bounded integer objective.

`strategy-complete` means the declared strategy did not find another accepted improvement. Large amount intervals are sampled, the search itself can have partial coverage, and simplifications can interact. Neither termination reason proves that no other scenario, amount, or combined edit has a smaller objective. Describe the outcome as reduced, or as unable to reduce further under the specified strategy and budget, rather than as a mathematical global minimum.

## Result and failure structure

Every public function uses a discriminated, JSON-safe result:

```ts
type EvidenceResult<T> =
  | { success: true; data: T }
  | { success: false; issues: MinimizationIssue[] }
```

A successful minimization contains:

| Field | Meaning |
| --- | --- |
| `originalWitnessId` | The selected Stage 4A candidate ID. |
| `originalScenario`, `minimizedScenario` | Complete validated input and reduced scenario. |
| `originalComparison`, `minimizedComparison` | Complete recomputed engine evaluations, traces, and signed category/total deltas. |
| `originalDeltaCents`, `minimizedDeltaCents` | Nonzero deltas with the same sign; positive means the new contract costs more. |
| `originalObjective`, `minimizedObjective` | The three objective metrics. |
| `checksPerformed`, `budgetExhausted`, `terminationReason` | Actual comparison usage and why simplification ended. |
| `reductionSteps` | Accepted edits in replay order. |
| `minimizationOptions` | Resolved `maxChecks`, including its default if omitted. |
| `candidateFailures` | Candidate scenarios whose validation or engine calculation failed, with structured issues. |

Each accepted step has a `type` (`remove-purchases`, `lower-purchase-amount`, or `reduce-payment-delay`), complete `before` and `after` scenarios, a reason, a successful validation record containing the delta and objective, and the actual accepted comparison. Future presentation code can replay the original scenario, each accepted step, and the final scenario without reconstructing hidden state.

Failure issues expose a string code, a path of string/number segments, and a readable message. Formal schema issues retain their underlying `validationCode`. Codes distinguish `validation_error`, engine `overflow`, `witness_mismatch`, `not_counterexample`, `out_of_bounds`, `invariant_violation`, and `proof_mismatch`. Invalid inputs and forged original witness results return failure with no partial minimization result. A candidate computation failure can coexist with a successful final result because the previously verified best scenario remains available.

## Proof creation, schema, and verification

Import `createImpactProof`, `verifyImpactProof`, `formatImpactReport`, `ImpactProofSchema`, and the public proof types from `src/proof/index.ts`:

```ts
createImpactProof(
  oldContractInput: unknown,
  newContractInput: unknown,
  witnessInput: unknown,
  searchOptionsInput: unknown,
  minimizationOptionsInput?: unknown,
): EvidenceResult<ImpactProof>

verifyImpactProof(proofInput: unknown): EvidenceResult<{
  proof: ImpactProof
  verifiedComparisons: number
}>

formatImpactReport(proofInput: unknown): EvidenceResult<string>
```

`createImpactProof` invokes the minimizer and packages its successful result with the validated contracts and source information. All input objects remain untouched. The proof can be saved with `JSON.stringify`, restored with `JSON.parse`, and supplied directly to `verifyImpactProof` in another environment running the same algorithm versions. It needs no database or original search ledger.

The current proof schema version is `1`. It identifies the unchanged calculation policy with engine version `stage3-v1` and the reduction strategy with minimizer version `stage4b-v1`. A caller must use a verifier compatible with those versions; an algorithm change must not silently reinterpret previously recorded evidence.

The strict, nested proof schema contains:

| Field | Recorded evidence |
| --- | --- |
| `proofSchemaVersion` | Literal `1`. |
| `engineVersion`, `minimizerVersion` | Literal algorithm identifiers `stage3-v1` and `stage4b-v1`. |
| `oldContract`, `newContract` | Complete formal Contract v1 inputs, including rules and descriptive metadata. |
| `witnessSource` | Candidate ID, sequence, source (`base`, `boundary`, or `seeded`), and optional generated parameters. |
| `searchOptions` | Complete validated Stage 4A options, including seed, selected bounds, search budget, and witness limit. |
| `originalScenario`, `minimizedScenario` | Complete formal Scenario v1 inputs under the tighter search capacities. |
| `originalComparison`, `minimizedComparison` | All recorded engine totals, category deltas, and ordered traces. The signed total delta is in each comparison. |
| `reductionSteps` | Complete accepted before/after edits, comparison results, objectives, reasons, and successful validation records. |
| `minimizationBudget` | Resolved `maxChecks`, actual `checksPerformed`, `budgetExhausted`, and `terminationReason`. |
| `calculationPolicy` | Fixed currency, monetary/rate units, rounding, Gregorian-day, delta, and effective-date policy descriptions. |
| `limitations` | The five required statements about synthetic data, lack of global minimality, historical provenance, lack of signatures/certification, and search coverage scope. |

There can be at most 299 accepted steps: the original comparison consumes at least one of 300 checks. An oversized step history is rejected before its scenarios and traces are parsed. Policy descriptions and limitations are fixed for this version; changing or dropping them fails schema validation. There are no unknown fields, implicit conversions, hidden timestamps, or non-JSON values.

The current calculation policy describes integer USD cents, integer basis points with 10,000 bps equal to 100%, per-transaction half-up rounding before adding the fixed fee, Gregorian calendar-day delay with early payments clamped to zero, and delta as new total minus old total. `effectiveDate` remains descriptive contract metadata and does not restrict counterfactual scenarios.

`verifyImpactProof` performs these checks in fixed order:

1. Validate the full proof format, algorithm versions, contracts, scenarios, traces, options, and limits.
2. Check budget consistency: comparisons cannot exceed `maxChecks`, each accepted step requires a comparison in addition to the original check, and exhaustion must agree with the counters and termination reason.
3. Check original/final range limits and reduction invariants, including preserved payment obligations and a non-worsening lexicographic objective.
4. Recompute the original and final comparisons, require exact agreement with all recorded values and traces, and require a nonzero delta with the same sign.
5. Replay every accepted step as a continuous chain from the original scenario. Require the step's edit type to match its actual changes, enforce invariants and bounds, require strict objective improvement, recompute its comparison, and check its validation record and delta direction.
6. Require the chain to end at the recorded reduced scenario and comparison.

Success returns a validated proof and `verifiedComparisons`, the number of actual engine comparisons in that verification. A successful run uses `2 + reductionSteps.length` comparisons, at most 301. Those calls are independent of the recorded minimization budget. A failure returns path-specific structured issues; the formatter propagates that failure instead of producing an unverified report.

Changing recorded transaction amounts, totals, deltas, or fee parameters without keeping the entire evidence consistent with fresh calculations is rejected. Changed payment obligations, hidden changes in a step, broken chains, worsening objectives, or sign changes are also rejected. The verifier does not rerun the search or the minimizer's rejected attempts, and cannot authenticate their historical counts or metadata. Consistently rewritten evidence is a new internally consistent submission, rather than a cryptographically detected forgery.

`formatImpactReport` verifies its unknown input first, then derives Markdown from the verified proof and engine data. The report includes Financial Experiment, Original Scenario, Minimized Scenario, Old Contract Total, New Contract Total, Cost Difference, Rule-Level Impact, Reduction Summary, Reproduction Information, and Limitations. It renders the actual transactions and obligations, category deltas and calculation traces, accepted steps, seed, options, versions, and budgets. USD formatting uses exact integer cents, including signed differences, without locale dependence or floating-point currency calculations. Caller-provided text is escaped for Markdown.

## Measured formal experiments

These results were obtained by calling the real Stage 4A search and Stage 4B minimizer against the unchanged Stage 2 contracts. All three searches used seed `20260401`, 120 search comparisons, five retained witnesses, purchase count 0 through 10, purchase amount 100 through 1,000 cents, and late days 0 through 5. Their bases contained no purchases; Grace Period Shift's existing payment initially used `paidOn: dueOn`. The bases compared at zero delta, so the selected witnesses were discovered by the search.

The selected witness was the first retained one with more than five purchases for Waiver Trap, or more than one purchase for the other experiments. Every minimization used `maxChecks: 200`.

| Experiment | Selected witness | Original purchases | Reduced purchases | Original payment delay | Reduced payment delay | Checks / budget | Accepted steps |
| --- | --- | --- | --- | --- | --- | ---: | ---: |
| The Waiver Trap | `boundary-5` | 6 × 100 cents | 5 × 100 cents | No payment | No payment | 11 / 200 | 1 |
| The Microtransaction Penalty | `boundary-1` | 10 × 149 cents | 1 × 100 cents | No payment | No payment | 6 / 200 | 4 |
| The Grace Period Shift | `boundary-1` | 10 × 100 cents | 0 | 2 calendar days | 2 calendar days | 4 / 200 | 1 |

| Experiment | Original old total | Original new total | Original delta | Reduced old total | Reduced new total | Reduced delta |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| The Waiver Trap | 0 cents | 1,200 cents | +1,200 cents | 0 cents | 1,200 cents | +1,200 cents |
| The Microtransaction Penalty | 10 cents | 210 cents | +200 cents | 1 cent | 21 cents | +20 cents |
| The Grace Period Shift | 0 cents | 1,500 cents | +1,500 cents | 0 cents | 1,500 cents | +1,500 cents |

All three returned `budgetExhausted: false`, `terminationReason: 'strategy-complete'`, and no failed candidate calculations. Their checks include the initial recomputation of the recorded witness. These are measured outcomes for the stated strategy and bounds, without a general global-minimum claim.

Each resulting proof was JSON-serialized, parsed back, successfully verified, and formatted as Markdown. The verifier recomputed three comparisons for Waiver Trap, six for Microtransaction Penalty, and three for Grace Period Shift (two endpoint comparisons plus each accepted step).

Waiver Trap retains five 100-cent purchases. Their 500-cent total satisfies the old five-purchase waiver, and does not meet the new 50,000-cent waiver. Removing another purchase would make the old monthly fee apply as well, producing zero difference, so those attempted removals are rejected.

Microtransaction Penalty removes nine purchases and lowers the retained amount from 149 to 100 cents. A single 100-cent purchase costs 1 cent under the old 100-bps contract and 21 cents under the new 60-bps-plus-20-cent contract. The reduction therefore retains a positive difference while lowering its absolute amount from 200 to 20 cents.

Grace Period Shift removes all ten purchases because neither contract has purchase-related fees. It retains the original `grace-payment-1` obligation, due on `2026-05-15`, completed on `2026-05-17`, for 10,000 cents. Reducing its two-day delay to one day or zero would remove the fee difference, so those probes are rejected. The old three-day grace period yields zero late fee; the new one-day grace period yields 1,500 cents.

## Reproduction workflow

Start with the unchanged formal fixtures, build a zero-delta base, and execute Stage 4A with explicit options:

```ts
import { searchCounterexamples } from '../src/search'
import { createImpactProof, formatImpactReport, verifyImpactProof } from '../src/proof'
import { experiments } from '../src/scenarios'

const searchOptions = {
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

for (const experiment of experiments) {
  const base = {
    ...experiment.scenario,
    transactions: [],
    paymentEvents: experiment.scenario.paymentEvents.map((event) => ({
      ...event, paidOn: event.dueOn,
    })),
  }
  const search = searchCounterexamples(
    experiment.oldContract, experiment.newContract, base, searchOptions,
  )
  if (!search.success) throw new Error(JSON.stringify(search.issues))
  // Deterministically select a searched witness with extra purchases when available.
  const redundantCount = experiment.id === 'waiver-trap' ? 5 : 1
  const witness = search.data.witnesses.find((entry) => entry.scenario.transactions.length > redundantCount)
    ?? search.data.witnesses[0]
  if (!witness) throw new Error('No witness was found in this range and budget.')
  const result = createImpactProof(
    experiment.oldContract, experiment.newContract, witness, searchOptions,
    { maxChecks: 200 },
  )
  if (!result.success) throw new Error(JSON.stringify(result.issues))
  const restored: unknown = JSON.parse(JSON.stringify(result.data))
  const verification = verifyImpactProof(restored)
  if (!verification.success) throw new Error(JSON.stringify(verification.issues))
  const report = formatImpactReport(restored)
  if (!report.success) throw new Error(JSON.stringify(report.issues))
  // Save result.data as JSON, or display report.data as Markdown in a caller.
}
```

Use the same code revision, complete contracts, explicit base scenario, selected candidate, search options, and minimization options to reproduce the search and reduction. The seed alone is insufficient. The APIs do not save files or start a server.

## Limits of evidence

A successful verification means the submitted data is internally consistent with the current schemas, calculation policies, and reduction constraints. It does not authenticate who created the inputs or whether a search historically ran. Someone can construct different, consistently recomputed fictional evidence; no signature or external provenance authority is part of this model.

The proof does not establish full contract equivalence, a global maximum difference, a global minimum witness, real-world financial applicability, or regulatory compliance. Stage 4A's `coverage.complete` records visits to all canonical parameter tuples in its simplified generated family. Such visits can include invalid-date attempts or failed financial comparisons, so that flag does not mean every scenario was successfully calculated. Proof verification does not upgrade search coverage into a stronger claim.

USD cents and integer basis points retain their Stage 2 meanings. The Stage 3 policy still uses exact internal integer arithmetic, per-purchase half-up proportional rounding followed by the fixed fee, and completed-payment late fees per event using calendar days. `effectiveDate` remains descriptive metadata rather than a scenario eligibility gate. There is no model of balances, unpaid obligations, partial repayment, interest, or real bank fee regulations.

## Validation

The existing 497 tests remain in place. Stage 4B adds runtime coverage for searched formal experiment reductions, positive and negative directions, smaller nonzero deltas, irreducible cases under the strategy, budget limits, forged witnesses, invalid dates, overflow, payment and transaction invariants, immutable inputs, deterministic results, proof JSON round trips, tamper rejection, and report consistency with recomputed financial data.

Run the full local verification sequence used by CI:

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

Neither the proof module nor these tests alter official fixture inputs or use preset proof answers in place of the search and engine.
