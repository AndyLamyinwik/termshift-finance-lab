# Architecture

## Implemented scope

TermShift starts as a single React application written in strict TypeScript and built with Vite. Stage 1 establishes the application shell, a responsive informational homepage, development tooling, a basic test, documentation, and continuous integration.

Stage 2 adds Contract v1 and Scenario v1 data models, financial rule types, Zod runtime validation, three synthetic experiment fixtures, and executable validation tests. It preserves the homepage and existing engineering configuration. The data model is independent of React and can be imported in a Node.js test environment.

Stage 3 adds a pure TypeScript calculation engine that evaluates the three supported fee rules and compares outcomes for two contracts under the same scenario. It returns structured calculation traces and deterministic validation or overflow failures. No Stage 2 input schema changes or new dependencies are required.

Stage 4A adds a pure TypeScript, bounded counterexample search over explicit purchase counts, uniform purchase amounts, and a shared delay for existing payment events. Contract-derived boundary candidates and a local seeded PRNG generate scenarios; the unchanged Stage 2 validators and Stage 3 `compareContracts` provide validation and every financial result. It adds no dependencies or changes to existing financial formulas.

Stage 4B adds a bounded, deterministic minimizer for Stage 4A witnesses and a JSON-safe Proof of Impact module. The minimizer verifies the original witness through the existing comparison engine before reducing it. Proof verification recomputes the financial evidence and checks preserved obligations and reduction constraints; Markdown formatting presents that verified data. The financial schemas, formulas, search implementation, formal fixtures, and homepage remain unchanged.

The homepage remains an informational project overview. Full Financial Diff, Counterexample Hunter, and Proof of Impact interfaces are future work. Stage 4B does not add structural rule comparison, a dashboard, interactive financial tools, deployment, PDF output, or Stage 5 functionality.

## Static frontend

Vite serves the application during local development and produces static HTML, CSS, and JavaScript assets for production. The production application runs in the browser and does not require an application server.

React components are responsible for presentation. Local CSS provides layout, responsive behavior, and the visual design. Fonts and visual assets must be available locally or provided by the operating system.

The project remains one frontend package; a monorepo, Next.js application, and backend services are outside this architecture.

## Runtime constraints

- No backend server, database, login system, or scheduled jobs.
- No AI, LLM, banking, or financial API integrations.
- No runtime requests to third-party APIs.
- No external CDN dependencies, remote fonts, or remote images.
- Financial rules, inputs, simulations, and explanations will be processed locally in the browser.
- Do not fabricate analysis results or present an unimplemented module as operational.

Fetching the application's own static assets is part of normal page loading. Dependency installation, Git operations, and GitHub Actions may use the network for development and build tasks. These allowances do not introduce runtime external services.

## Financial data contracts

`src/models/index.ts` exposes the schemas, inferred TypeScript types, and safe validation functions. The implementation uses small modules with defined responsibilities:

| Module | Responsibility |
| --- | --- |
| `primitives.ts` | Validate IDs, bounded names and versions, integer monetary units, and strict Gregorian dates and billing months. |
| `rules.ts` | Define monthly fee, transaction fee, late fee, and monthly fee waiver structures. |
| `contract.ts` | Assemble the strict Contract v1 object and require at least one supported rule. |
| `scenario.ts` | Assemble strict transactions, completed payment events, and Scenario v1; enforce bounded arrays, unique IDs within each array, and transaction billing-month membership. |
| `validation.ts` | Safely validate `unknown` inputs and return deterministic success data or structured issues. |
| `index.ts` | Provide the public entry point for models and validators. |

Contract v1 supports USD, calendar-month billing, and three optional named rules: `monthlyFee`, `transactionFee`, and `lateFee`. At least one rule must be present. Each rule has a separate schema. The monthly fee waiver is a discriminated union so transaction-count and purchase-total thresholds retain their distinct units.

Scenario v1 contains a billing month, purchase transactions, and completed payment events. Transactions must occur in that month. Payment due dates and paid dates may fall outside it, and early payment is valid. A payment record does not model an unpaid balance, partial repayment, a minimum payment, interest, or compounding.

All nested model objects reject unknown fields. Validation performs no implicit conversion or date repair. Calendar fields use Gregorian year, month, and day arithmetic, with years from 0001 through 9999, instead of JavaScript `Date` normalization. The engine compares calendar-day ordinals rather than timestamps or local-time instants. Contract `effectiveDate` describes its version and is not an eligibility check against a scenario; counterfactual experiments may pair a contract with an earlier scenario.

Scenario input limits are 10,000 transactions and 1,000 payment events. Empty arrays are valid. Inputs exceeding these limits are rejected before their elements are parsed. IDs are unique within each collection; an ID can appear once in each collection because transaction and payment IDs occupy separate namespaces.

`validateContract(unknown)` and `validateScenario(unknown)` return either `{ success: true, data }` or `{ success: false, issues }`. Each issue has a path of string or number segments, a code, and a readable message. Validation does not depend on the clock, timezone, randomness, or network and produces the same result for the same input.

`src/scenarios/` holds explicit, synthetic data for the three named experiments. Fixtures contain an old contract, a new contract, a scenario, and descriptive text. They contain no computed fee totals, comparisons, winners, or impact results. Their data is validated by the same public validators available to future consumers.

The detailed input contract is documented in [FINANCIAL_MODEL.md](FINANCIAL_MODEL.md).

## Calculation engine and future boundaries

`src/engine/index.ts` exposes `evaluateContract`, `compareContracts`, and their result/trace types. Both APIs accept `unknown`, validate through the Stage 2 `validateContract` and `validateScenario` functions, and return a discriminated success/failure result. A comparison validates one scenario for both contracts and either returns both complete evaluations and their deltas or a failure with no partial output. Inputs are not mutated.

The engine has small modules with specific responsibilities:

| Module | Responsibility |
| --- | --- |
| `types.ts` | Define JSON-safe evaluations, comparison deltas, discriminated calculation traces, and structured engine issues. |
| `money.ts` | Perform exact internal `bigint` arithmetic, rational half-up rounding, and checked conversion to safe integer numbers. |
| `dates.ts` | Convert validated Gregorian dates to calendar-day ordinals and calculate signed day differences without timestamps or timezones. |
| `evaluate.ts` | Validate unknown inputs, clamp early-payment day differences to zero, assess enabled fee rules, build ordered traces, and produce checked category/grand totals. |
| `compare.ts` | Evaluate old and new contracts for the same scenario and calculate signed new-minus-old deltas. |
| `index.ts` | Provide the public calculation entry point. |

Trace order is enabled monthly fee first, then enabled transaction fees in scenario transaction order, then enabled late fees in payment-event order. Assessed zero charges remain in the trace, including waived monthly fees and on-time payments. Missing rules contribute zero category totals and no trace entries. The traces preserve numerical inputs and decisions so a future presentation layer can explain the computed result without reimplementing the rules.

The completed-payment late fee is a synthetic per-event assessment. It does not represent the account-level late fees commonly used by real credit cards, a balance ledger, partial repayments, interest, or bank regulatory rules. Payment amounts are validated input metadata and do not change a late fee in this model.

The wider module boundaries distinguish implemented foundations from future product work:

| Boundary | Responsibility |
| --- | --- |
| Types | Define contracts, supported rules, scenarios, monetary values, outcomes, and calculation traces. |
| Validation | Check input shape, supported rules, currencies, numerical ranges, and scenario constraints before calculation. |
| Money | Handle integer minimum currency units, checked arithmetic, rate representations, and explicit rounding policies. |
| Engine | Evaluate a validated contract against an explicit scenario and return its outcome and trace. |
| Scenarios | Represent bounded, reproducible inputs and fixed synthetic fixtures; search generates a declared simplified family without altering those fixtures. |
| Diff | Compare category and total outcomes for the same scenario; structural rule comparison and a product interface remain future work. |
| Counterexamples | Search declared bounded scenarios for a nonzero comparison delta, then reduce a verified witness within its bounds while preserving the sign of the difference. A product interface remains future work. |
| Explanations | Preserve calculation traces and reduction history in verifiable JSON evidence and format readable Markdown; an interactive presentation layer remains future work. |

The rules engine is independent of React and browser presentation. Its core functions are pure and deterministic: the same contract and scenario yield the same result. Evaluation uses only explicit input dates. Search likewise uses explicit bounds and a seed rather than reading the system clock or an external service.

Presentation components will collect inputs and render validated results. They should not contain financial rule logic. The engine should return structured traces that preserve the rules and intermediate values used in a calculation; the explanation layer should describe that evidence without inventing unsupported conclusions.

## Counterexample search

`src/search/index.ts` exposes `searchCounterexamples`, the strict `SearchOptionsSchema`, a safe options validator, and JSON-safe search types. The API accepts unknown contracts, base scenario, and options; it returns either structured issues or a complete report with candidates, counts, coverage, and witnesses.

| Module | Responsibility |
| --- | --- |
| `types.ts` | Define options, candidate parameters and ledger entries, witnesses, coverage, reports, and issues. |
| `options.ts` | Validate required inclusive integer bounds, their ordering, and explicit budgets. |
| `boundaries.ts` | Lazily derive bounded candidate parameters from actual waiver, fee, rate, and grace-period values. |
| `generator.ts` | Build fresh uniform-purchase/shared-delay scenarios, step Gregorian dates, and implement the local seeded PRNG. |
| `search.ts` | Validate inputs, enforce capacity, deduplicate scenarios, call the existing comparison API, track bounded work and coverage, and rank witnesses. |
| `index.ts` | Provide the public search entry point. |

Stage 4A's generated family has zero through 30 purchases, each with one shared amount of 1 through 100,000 USD cents, and one delay of zero through 31 days applied to at most five existing payment events. Purchase dates stay within the base billing month. Payment due dates, amounts, and IDs are preserved; no payment obligations are created. Date generation uses strict calendar arithmetic across leap days and year boundaries. Dates past year 9999 produce a recorded candidate failure.

Every generated candidate passes formal Scenario validation before comparison. Search never interprets an overflow as zero difference. Its ledger records pre-comparison skips and comparison failures separately; actual comparison calls, including failures, consume the explicit budget of at most 500. The search rejects oversized base arrays rather than removing data. At most 512 boundary attempts, 2,000 seeded attempts, and one base attempt can be recorded, avoiding unbounded loops or a full Cartesian product.

The seed controls a local 32-bit PRNG. Given the same full inputs, options, seed, and code revision, the API reproduces the same candidate order and report. Candidate content is deduplicated using fields relevant to current fees, preventing repeated comparisons when IDs or within-month purchase dates differ. If future rules use additional fields, deduplication must account for those fields.

Witnesses contain a complete scenario, the complete Stage 3 comparison, and stable candidate identification. Only nonzero engine deltas qualify. Selection favors larger absolute differences with deterministic tie breaking and preserves both positive and negative representatives when capacity permits. The report distinguishes the largest observed difference from a global optimum.

Coverage is measured only over the uniform-purchase/shared-delay family. A zero count removes the irrelevant amount dimension; an empty payment collection removes the irrelevant delay dimension. A base matching that family can contribute to coverage, while a nonuniform base is only an additional explicit comparison. Complete coverage requires visiting every canonical tuple, including recorded invalid-date attempts; it does not imply that failed candidates were financially evaluated or that unrestricted contracts are equivalent. No witness found means none was found in the stated range and budget.

Search and minimization retain separate boundaries. The Stage 4A API still returns complete observed witnesses; Stage 4B explicitly consumes one of those witnesses with its search options. See [COUNTEREXAMPLE_SEARCH.md](COUNTEREXAMPLE_SEARCH.md) for precise options, algorithm behavior, report fields, failure interpretation, and reproducible synthetic examples.

## Counterexample minimization and impact evidence

`src/minimizer/index.ts` exports `minimizeWitness`, the options schema, and typed reduction results. `src/proof/index.ts` exports proof creation, runtime verification, and Markdown formatting. Both modules accept unknown inputs at their public boundaries, work in Node.js without React or the DOM, and depend on the existing formal schemas and `compareContracts`. They do not calculate fees independently.

The minimizer's strict witness schema checks complete scenario and comparison structures. It recomputes the original result and rejects mismatched recorded comparisons, deltas, or zero-delta inputs. Both the original and each candidate must satisfy the Stage 2 Scenario schema, Stage 4A's chosen inclusive count/amount/delay bounds, and the tighter capacity limits of 30 purchases and five payment events. Early payments have effective delay zero and remain unchanged.

Reduction preserves scenario identity, billing month, retained transaction order, IDs, dates, and kinds. Transactions can be deleted or have their amounts lowered. Payment order, count, IDs, due dates, and obligation amounts remain unchanged; a late paid date can only move toward its due date. This can produce nonuniform purchase amounts and separate payment delays, so the reduced scenario need not belong to the search's generated uniform/shared-delay family.

The objective is the lexicographic tuple `(purchaseCount, purchaseTotalCents, totalLateDays)`, where late days are clamped at zero per payment. Each accepted change must strictly improve that tuple, retain a nonzero difference with the original sign, and pass a fresh engine comparison. The fixed strategy tries purchase groups, individual purchases, smaller integer amounts, and lower nonnegative delays. It records accepted before/after scenarios, comparisons, reasons, and validation evidence without mutating input objects.

The default budget is 200 engine comparisons and the hard limit is 300. The original verification and failed comparisons count toward the budget; duplicate candidates do not count again. Budget exhaustion returns the best valid result found so far. A completed strategy means its defined probes found no further improvement. It is not a proof of a global minimum, and the amount probes do not assume monotonic fee differences.

Proof data includes schema and algorithm versions, complete contracts, source metadata, search options and seed, both scenarios and comparisons, reduction steps, the minimization budget, calculation policy, and limitations. The verifier validates the format and input models, recomputes recorded comparisons, enforces direction and range constraints, and checks retained obligations and the objective. Verification establishes consistency of the submitted data under the current algorithms; it does not certify historical search execution, immutable provenance, cryptographic authenticity, or financial regulatory approval.

The formatter verifies a submitted proof before returning Markdown containing actual scenario details, USD totals, signed deltas, category impacts, reductions, reproduction information, and limitations. It introduces no UI or PDF pipeline. See [MINIMIZATION_AND_PROOF.md](MINIMIZATION_AND_PROOF.md) for complete API contracts, serialized fields, failure behavior, and measured synthetic examples.

## Monetary representation

Contract v1 supports only USD. Amount fields ending in `Cents` store USD cents as JavaScript safe integers; one USD is 100 cents. A fee may be zero, while transaction amounts, completed payment amounts, and purchase-total waiver thresholds must be positive. Transaction-count thresholds are positive safe integer counts, and grace periods are nonnegative safe integer calendar days. Transaction fee rates are integer basis points from 0 through 10,000; one basis point is 0.01 percent.

Future currency support must represent amounts in each currency's minimum unit. The scale belongs to the currency definition; it must not assume that every currency has two decimal places. USD's current cents representation is an explicit v1 restriction, not a general currency model.

Validation enforces safe integer input ranges and rejects decimals, `NaN`, `Infinity`, and out-of-range numbers. Stage 3 uses internal `bigint` sums, products, division, and subtraction. It converts monetary results to numbers only after checking `Number.MAX_SAFE_INTEGER`, including trace purchase totals, individual charges, category totals, and the grand total. Comparison deltas are checked against the signed safe integer range. Overflow returns a structured failure instead of a truncated value or partial result. No `bigint` is exposed in public JSON results.

Each transaction's proportional fee is `roundHalfUp(amountCents × rateBps / 10000)`, calculated as an exact nonnegative rational value. Half-cent ties round up. The fixed fee is added after that rounding, then per-transaction charges are summed. Rounding a combined purchase total is a different policy and is not used. Formatting amounts for display must not alter the values used by the engine.

See [CALCULATION_ENGINE.md](CALCULATION_ENGINE.md) for formulas, the Gregorian ordinal algorithm, public result structures, trace fields, failure paths, and worked fixture calculations.

## Quality checks

The local development baseline is Node.js 24 LTS and npm. TypeScript strict mode, ESLint, and Vitest provide separate checks for type correctness, code quality, and executable behavior.

Zod is the only runtime dependency added for Stage 2. Runtime tests verify the real validators, including fixtures, invalid amounts, calendar edge cases, rule structures, strict keys, array bounds, duplicate IDs, early and cross-month payments, JSON round trips, and determinism.

Stage 3 adds no dependencies. Its Node.js unit tests exercise the formal fixtures and readable financial boundaries: waiver thresholds, per-transaction half-cent rounding, combined rules, absent rules, Gregorian date boundaries, overflow, validation failures, negative/zero comparisons, input immutability, JSON round trips, trace sums, and category-delta sums. The Stage 1 and Stage 2 suites remain in place.

Stage 4A preserves all 359 existing tests and adds Node.js search tests for discoveries from zero-delta bases, seeded reproducibility and variation, actual comparison consistency, formal scenario validation, bounds and budgets, deduplication, both delta directions, scoped no-witness results, overflow, calendar generation, immutability, and JSON serialization. It adds no runtime dependency.

Stage 4B preserves all 497 existing tests and adds runtime tests for real searched-witness reduction, positive and negative deltas, nonzero direction preservation, reduced absolute differences, budgets, forged evidence rejection, obligation/date/range invariants, overflow, immutable inputs, deterministic reruns, JSON proof round trips, tamper rejection, and Markdown consistency. It adds no dependency and does not change the existing financial formulas or search API.

GitHub Actions runs `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` on pushes and pull requests. A committed `package-lock.json` supports reproducible dependency installation. Secrets, dependency directories, and build artifacts must not be committed.

## Future deployment target

The intended hosting target is GitHub Pages for the public `termshift-finance-lab` repository. Vite's base path is configured as `/termshift-finance-lab/` so generated asset URLs support that repository path.

The HTML favicon uses Vite's `%BASE_URL%` placeholder so its production URL includes that base path. The repository provides CI only. GitHub Pages publishing, deployment permissions, and release automation belong to a later stage.
