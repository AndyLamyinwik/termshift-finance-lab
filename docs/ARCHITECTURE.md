# Architecture

## Implemented scope

TermShift starts as a single React application written in strict TypeScript and built with Vite. Stage 1 establishes the application shell, a responsive informational homepage, development tooling, a basic test, documentation, and continuous integration.

Stage 2 adds Contract v1 and Scenario v1 data models, financial rule types, Zod runtime validation, three synthetic experiment fixtures, and executable validation tests. It preserves the homepage and existing engineering configuration. The data model is independent of React and can be imported in a Node.js test environment.

Stage 3 adds a pure TypeScript calculation engine that evaluates the three supported fee rules and compares outcomes for two contracts under the same scenario. It returns structured calculation traces and deterministic validation or overflow failures. No Stage 2 input schema changes or new dependencies are required.

Stage 4A adds a pure TypeScript, bounded counterexample search over explicit purchase counts, uniform purchase amounts, and a shared delay for existing payment events. Contract-derived boundary candidates and a local seeded PRNG generate scenarios; the unchanged Stage 2 validators and Stage 3 `compareContracts` provide validation and every financial result. It adds no dependencies or changes to existing financial formulas.

Stage 4B adds a bounded, deterministic minimizer for Stage 4A witnesses and a JSON-safe Proof of Impact module. The minimizer verifies the original witness through the existing comparison engine before reducing it. Proof verification recomputes the financial evidence and checks preserved obligations and reduction constraints; Markdown formatting presents that verified data. The financial schemas, formulas, search implementation, formal fixtures, and homepage remain unchanged.

Stage 5A replaces the informational overview with an interactive financial dashboard for the three formal experiments. React state controls the experiment selection, and the existing `compareContracts` API supplies all summary amounts, category comparisons, and calculation traces. The dashboard handles structured engine failures, formats integer cents exactly, and uses local responsive CSS and semantic controls. It does not modify the financial models, formulas, search/minimization APIs, or fixtures.

Stage 5B-1 adds a Financial Diff editor and shared in-memory workspace state. Users can edit the existing supported financial rules on independent old/new working contracts, validate and apply them together, and reset the original experiment terms. Dashboard and Financial Diff use the same applied contracts and unchanged scenario. Input parsing and presentation do not replace the existing financial formulas or alter fixtures and core APIs. No dependencies are added.

Stage 5B-2 adds Counterexample Hunter to the same workspace. The view validates text search controls, builds a neutral copy of the selected scenario, and calls the existing Stage 4A search only on explicit Run Search. Report statistics and retained witnesses render the existing results; selected-witness financial evidence comes directly from its Stage 3 Comparison. Applied contracts, search settings, input snapshots, reports, and selection remain in memory across view navigation. Related input changes clear results. The financial core, formal fixtures, Proof APIs, and dependencies remain unchanged.

Stage 5C-1 adds Proof of Impact Viewer to the same workspace. An explicit Generate Proof action takes the current search snapshot's contracts, selected witness, and numeric options, calls the unchanged Stage 4B creator, then calls its verifier before displaying Verified. The view renders original/reduced evidence, actual verification and budget information, and accepted reductions in bounded batches. View changes and pending drafts preserve valid proof state; relevant input changes clear it. No core algorithms, fixtures, or dependencies change.

Stage 5C-2 adds portable evidence using the existing Proof Schema and APIs: complete verified JSON downloads, official Markdown reports, and bounded local-file import followed by independent verification. Imported evidence has a separate state boundary inside the same workspace hook and never becomes an applied contract, SearchSnapshot, or fabricated Hunter witness. Current and imported evidence reuse the same proof presentation with explicit labels. No dependency, financial formula, schema, core verifier, or fixture changes.

Stage 6 adds a GitHub Pages delivery workflow for the existing static application. A main-branch push or an explicit manual run verifies the source, builds `dist/`, attaches static commit metadata, and publishes the artifact through official GitHub Pages Actions. The existing CI remains independent. Delivery does not change financial schemas, formulas, search, minimization, verification, fixtures, or runtime dependencies.

Structural rule comparison, scenario editing, rule-category additions/removals, and PDF generation remain outside the implemented product scope. Version tags and GitHub Releases are separate from deployment. Public hosting does not imply financial regulatory certification.

## Static frontend

Vite serves the application during local development and produces static HTML, CSS, and JavaScript assets for production. The production application runs in the browser and does not require an application server.

React components are responsible for presentation and the shared workspace's selection, applied-contract, text-draft, search-report, witness-selection, minimization-control, current/imported proof verification, and view state. Native FileReader and Blob downloads form the local file boundary. Local CSS provides layout, responsive behavior, and the visual design. Fonts and visual assets are local or provided by the operating system.

The project remains one frontend package; a monorepo, Next.js application, and backend services are outside this architecture.

## Runtime constraints

- No backend server, database, login system, or scheduled jobs.
- No AI, LLM, banking, or financial API integrations.
- No runtime requests to third-party APIs.
- No external CDN dependencies, remote fonts, or remote images.
- No third-party tracking, service worker, PWA, or automatic persistent storage of financial inputs.
- Financial rules, inputs, simulations, and explanations are processed locally in the browser.
- Do not fabricate analysis results or present an unimplemented module as operational.

Fetching the application's own static assets is part of normal page loading. Dependency installation, Git operations, and GitHub Actions may use the network for development and build tasks. These allowances do not introduce runtime external services.

## Workspace and comparison presentation

`App.tsx` owns the `useWorkspace` hook and supplies its controller through props to Dashboard, Financial Diff, Counterexample Hunter, and Proof of Impact. Sidebar buttons switch the active view without a router, URL state, or state-management dependency. The app retains the TermShift brand, project status, and accessible content entry point. All four modules are operational. Components are separated by responsibility:

| Module | Responsibility |
| --- | --- |
| `App.tsx` | Own the workspace hook and semantic navigation for the four operational views. |
| `workspace/useWorkspace.ts` | Hold shared state, validate Apply, run existing search/proof APIs, invalidate current evidence, and independently manage imported evidence with latest-selection guards and export actions. |
| `workspace/types.ts` | Declare the workspace controller, SearchSnapshot, current ProofState, separate ImportedProofState, and evidence-source selection. |
| `workspace/WorkspacePresentation.tsx` | Share the experiment selector, draft/applied status notices, comparison summaries, traces, and structured engine error display. |
| `dashboard/Dashboard.tsx` | Present the selected experiment and shared applied-contract results. |
| `ComparisonPanels.tsx` | Render old/new totals, signed cost difference, three fee categories, readable values, and CSS comparison bars from a `Comparison`. |
| `CalculationDetails.tsx` | Render expandable old/new `Evaluation.trace` records according to their discriminated `ruleType`. |
| `format.ts` | Format safe integer USD cents and signed differences exactly, independently of React and financial fee formulas. |
| `financial-diff/FinancialDiff.tsx` | Present the shared selection, two contract editors, Apply/Reset controls, validation feedback, and applied-contract results. |
| `financial-diff/ContractEditor.tsx` | Render controlled text fields for existing rules, explicit units, waiver-kind selection, and accessible field errors. |
| `financial-diff/drafts.ts` | Parse bounded raw USD/integer text exactly, reject rule-set changes, preserve metadata, and validate final values with the formal Contract schema. |
| `hunter/CounterexampleHunter.tsx` | Present applied-contract context, the separate starting scenario, controls, structured failures, statistics, and selected-witness evidence. |
| `hunter/SearchControls.tsx` | Render the nine controlled search text fields with explicit units, limits, associated field errors, and Run Search. |
| `hunter/SearchSummary.tsx` | Render original SearchReport counts, stop reason, source evaluations, coverage, and scoped conclusions. |
| `hunter/WitnessExplorer.tsx` | Render the bounded retained-witness list and the selected witness's real scenario, Comparison, and reproduction evidence. |
| `hunter/options.ts` | Validate canonical text through exact shared parsers and the formal SearchOptions validator; create an independent validated neutral Search Base. |
| `proof-viewer/ProofViewer.tsx` | Present selected snapshot context, empty state, validated minimization controls, explicit Generate/Verify Again/Clear actions, structured issues, explanations, and limitations. |
| `proof-viewer/ProofOverview.tsx` | Present actual proof versions, provenance, delta, checks/budget/termination, and verified comparison count. |
| `proof-viewer/ProofPresentation.tsx` | Reuse the overview, comparison, timeline, traces, limitations, and structured issue renderer for either evidence source; imported data uses its embedded metadata. |
| `proof-viewer/BeforeAfterComparison.tsx` | Compare actual original/minimized Scenario counts, amounts, obligations, delays, and Comparison totals. |
| `proof-viewer/ReductionTimeline.tsx` | Show accepted reductions in ten-step batches with before/after summaries and accepted comparison evidence. |
| `proof-viewer/scenarioPresentation.ts` | Summarize actual purchase totals with integer arithmetic and payment delays with the existing Gregorian helpers; supply display-only scenario/objective labels. |
| `proof-viewer/options.ts` | Strictly validate required maxChecks text with the existing exact integer parser and official MinimizationOptionsSchema; derive the default budget from that schema. |
| `portable-evidence/EvidenceActions.tsx` | Present source selection, verified JSON/Markdown downloads, native file import, imported verification/clear controls, and export errors. |
| `portable-evidence/portable.ts` | Read bounded native file bytes, strictly decode UTF-8, parse JSON, call official proof validation/verification, prepare complete JSON or official Markdown, and dispatch cleaned-up native Blob downloads. |
| `App.css` and `index.css` | Provide the local dark visual system, responsive layout, focus treatment, and reduced-motion support. |

The financial data flow is `src/scenarios/` fixture → independent working contract copies → `compareContracts(workingOldContract, workingNewContract, selectedExperiment.scenario)` → `Comparison` → summaries, category bars, and traces. Fixture objects supply inputs and descriptions rather than predetermined answers. The scenario is identical for both evaluations and is never edited by this UI. Selection and valid Apply operations recalculate locally without editing fixtures, initiating a network request, or showing a simulated network loading state.

Both views check the shared comparison result's `success` discriminant. On failure, they render readable original issue paths, codes, and messages instead of totals or a substitute zero-cost result. On success, positive, negative, and zero differences have explicit text as well as visual states. A concise live announcement describes changed results; the full trace is outside the live region.

The sidebar's native buttons, labeled experiment selector, controlled text fields, waiver selector, and native `details`/`summary` controls support keyboard operation. Navigation buttons have accessible names and `aria-current` marks the active view. Layouts use flexible columns and wrapping content for small screens, with visible focus states and no fixed reading heights. Contract editors and original/reduced proof panels use two columns on desktop and stack on narrow screens. Field errors use associated descriptions and `aria-invalid`. The fee bars supplement text amounts; their widths are display ratios, and their colors are not the sole means of communicating a difference.

Financial rules are never implemented in the presentation modules. Monthly traces display the actual count or purchase-total waiver threshold and decision; transaction traces display the transaction amount, fixed fee, basis-point rate, rounded proportional fee, and charged fee; late traces display due/paid dates, late/grace days, and the charged fee. These values come directly from the existing engine evidence.

## Working Draft and Apply data flow

The workspace tracks `selectedExperimentId`, `workingOldContract`, `workingNewContract`, `activeView`, both raw `ContractDraft` objects, field issues, and Apply status. It retains snapshots of the applied text drafts to derive `hasUnappliedChanges`; separate modified flags compare working contracts to the current original fixtures. Raw drafts and applied numeric contracts serve different purposes: incomplete text can be retained in a field without becoming a financial input.

`contractToDraft` creates editable text from cloned formal contracts. `parseContractDraft(baseContractInput, draftInput)` accepts unknown input, strictly validates draft structure, and rejects attempts to add or remove rule categories. It preserves contract ID, name, schema version, semver, currency, billing cycle, and effective date. Only the existing monthly fee and waiver, transaction fixed fee/rate, and late fee/grace fields are editable.

USD and integer inputs are capped at 24 characters before `BigInt` conversion. USD text accepts canonical non-negative ASCII decimal strings with up to two fractional digits; whole-dollar and fractional parts form exact integer cents without `parseFloat(value) * 100`. The upper bound is `90071992547409.91` USD, equal to `Number.MAX_SAFE_INTEGER` cents. Integer fields accept canonical digits only. Blank text, signs, whitespace, leading zeros, scientific notation, non-finite tokens, and other invalid numeric formats are rejected without trimming or correction. Waiver counts are positive safe integers, purchase-total waiver thresholds are positive cents, rates are integer basis points from 0 to 10,000, and grace days are non-negative safe integers.

Apply parses both Old and New drafts and calls the Stage 2 `validateContract` for each final numeric contract. It commits both contracts together only if both validations succeed. Failure retains all text and the last applied contracts, exposes errors at the corresponding fields, and identifies displayed results as belonging to the last applied version. Valid contracts can still overflow when evaluated; the new applied contracts remain available for correction while the engine failure replaces financial success panels. The UI distinguishes contract validation from successful calculation.

The comparison is memoized against working-contract references and the selected formal scenario. Editing raw fields and navigating between views do not send unvalidated data to the engine. Applied changes and raw drafts survive view switching. Reset clones both original contracts, rebuilds their text drafts, clears validation errors and pending edits, and retains the active view and experiment. Selecting a different experiment does the same for its original terms; an adjacent selector notice explains beforehand that both pending and applied changes will be discarded.

All workspace state exists only in the current page's React memory. Reload initializes Dashboard with the original Waiver Trap. There is no local storage, server persistence, runtime API, URL routing, or scenario mutation. Modified working contracts are visibly marked so their retained metadata cannot be mistaken for untouched fixtures. See [FINANCIAL_DIFF.md](FINANCIAL_DIFF.md) for the editing workflow.

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
| Diff | Edit existing contract rules through validated drafts and compare category and total outcomes for the same unchanged scenario; Dashboard and Financial Diff share applied contracts and traces. Structural rule comparison remains future work. |
| Counterexamples | Search declared bounded scenarios for a nonzero comparison delta; Counterexample Hunter presents applied-contract search, bounded results, and selected-witness evidence. Proof Viewer explicitly runs the existing minimizer on that saved witness. |
| Explanations | Present calculation traces and verified original/reduced comparisons, budgets, and accepted reduction history in Proof Viewer. The independent core also supports JSON evidence and Markdown formatting; downloads and import remain outside this stage. |

The rules engine is independent of React and browser presentation. Its core functions are pure and deterministic: the same contract and scenario yield the same result. Evaluation uses only explicit input dates. Search likewise uses explicit bounds and a seed rather than reading the system clock or an external service.

Presentation components select explicit fixtures and render validated results without financial rule logic. The engine returns structured traces that preserve the rules and intermediate values used in a calculation; the presentation and explanation layers describe that evidence without inventing unsupported conclusions.

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

## Counterexample Hunter workspace flow

The existing workspace now owns nine raw `SearchOptionsDraft` strings, search field errors, structured search failure issues, and an optional successful `SearchSnapshot`. A snapshot contains detached `oldContract`, `newContract`, and `baseScenario` inputs, validated numeric `searchOptions`, the complete `searchReport`, and `selectedWitnessId`. It records exactly the applied inputs used for the successful run. All state remains in React memory; reload clears it, with no LocalStorage, database, or server persistence.

`createSearchBase(unknown)` first validates the complete original formal Scenario, so invalid purchases or paid dates cannot be hidden by neutralization. It returns a separate validated copy preserving schema version, ID, billing month, and every existing payment's ID, due date, and amount. Transactions become an empty array and each existing payment's `paidOn` becomes `dueOn`. It does not create or remove obligations. Dashboard and Financial Diff continue to use the unchanged original Dashboard Scenario. Hunter labels its copy Search Starting Scenario and displays its actual Stage 3 comparison under the applied working contracts.

The workspace memoizes the neutral copy against the selected formal scenario. It performs the starting comparison when Hunter is active, without adding an unnecessary comparison to Dashboard or Financial Diff. Unmodified official contracts produce zero starting difference; modified contracts may differ at the base. That value comes from `compareContracts`, not a UI constant. A starting comparison failure is displayed through its structured issues, without a zero substitute.

Search text uses the existing bounded exact USD and integer parsers. `parseSearchOptionsDraft(unknown)` validates all required text fields with a strict object schema, converts USD to integer cents without floating multiplication, and calls the official Stage 4A `validateSearchOptions`. Formal amount-error paths map back to the USD input fields. The validator enforces seed 0–4,294,967,295; comparison budget 1–500; retained results 1–10; purchase counts 0–30; purchase amounts 1–100,000 USD cents; and delays 0–31 calendar days. Each minimum must be no greater than its maximum. No value is trimmed, rounded, clamped, or silently expanded.

Only a user Run Search action invokes `searchCounterexamples`. The hook clones applied contracts and the validated neutral base, then calls the unchanged Stage 4A API with validated options. Raw Financial Diff text never enters this call. A visible pending-draft reminder explains that searches use the last applied contracts. The existing synchronous pure function runs locally; there is no network wait, fake progress, cancellation control, worker, or backend task. Search failures clear old success state and expose original issue codes, paths, and messages.

Result validity follows the inputs that produced it:

| Operation | Search settings and result behavior |
| --- | --- |
| Edit seed, range, budget, or result limit | Retain the edited text; clear report, selected witness, and old errors; rerun only after Run Search. |
| Valid Financial Diff Apply | Clear report and witness selection; retain search settings for an explicit rerun with the newly applied contracts. |
| Pending draft edit or invalid Apply | Preserve the report because applied contracts are unchanged; show the pending-draft reminder. |
| Reset to Original | Restore original applied contracts, default search settings, and neutral context; clear report and witness selection. |
| Select a different experiment | Restore that experiment's originals and search defaults; clear prior report and selection. |
| Select the same experiment or switch views | Preserve still-valid settings, report, and witness selection. |

The UI presents `evaluatedCount` as actual financial comparisons including failures, and successful comparisons as `evaluatedCount - failedCount`. Skips, failures, visited canonical parameter tuples, source evaluations, and the comparison budget are distinct statistics. `coverage.complete` concerns traversal of the declared family and does not certify successful evaluation of every tuple, unrestricted financial coverage, or contract equivalence. A no-witness report says “No counterexample found within the selected search range and budget.” Retained witnesses are observed representative cases, without a global maximum claim.

The retained list contains at most ten items. Purchase count and total derive from each witness's actual transaction array, and payment-delay summaries use the existing calendar-day helper. Selected details display individual transaction/payment records and the witness's existing Comparison, category deltas, traces, source, sequence, seed, and numeric bounds. Selecting another witness changes presentation only and does not rerun search, but clears an existing proof for the previous selection. The complete candidate ledger remains in the snapshot for data integrity but is not rendered as thousands of DOM entries. Proof generation belongs to the separate explicit Proof Viewer action. See [COUNTEREXAMPLE_UI.md](COUNTEREXAMPLE_UI.md) for the user workflow and concrete experiments.

## Proof Viewer workspace flow

The successful `SearchSnapshot` is the sole provenance boundary for proof generation. It contains the exact old/new contracts, base scenario, numeric search options, full search report, and selected witness ID used by the active run. The workspace resolves that ID against the snapshot's retained witnesses before creating evidence. Applied-contract changes clear the snapshot and its proof together, so a report from earlier contract terms cannot authorize a current Verified badge. Pending Financial Diff text never enters proof input.

The workspace holds raw minimization budget text, associated field issues, and a discriminated `proofState`: `idle`, `success`, or `failure`. Success stores both a complete `ImpactProof` and the actual successful verification payload, including `verifiedComparisons`. Failure identifies the creation or verification phase, preserves original structured issues, and can retain the created proof for a verification retry. A creation failure has no successful proof. UI labels reflect this state: Not generated, Verification failed, or Verified. Successful creation alone cannot become Verified.

`createMinimizationOptionsDraft()` reads the formal schema's default, 200, into a fresh required text field. `parseMinimizationOptionsDraft(unknown)` rejects unknown draft keys and missing/non-string fields, then calls the existing canonical integer parser with inclusive limits 1–300 and the unchanged `MinimizationOptionsSchema`. Text is capped at 24 characters, with no whitespace trimming, fractional conversion, sign handling, scientific notation, leading zeros, or silent clamping. Invalid text exposes a `maxChecks` field path and prevents the proof creator call.

Only Generate Proof calls `createImpactProof(snapshot.oldContract, snapshot.newContract, selectedWitness, snapshot.searchOptions, parsedOptions)`. On success it immediately calls `verifyImpactProof` on that result. This synchronous flow is independent of renders, navigation, and input typing. Verify Again calls only `verifyImpactProof` against the saved proof; it neither searches nor minimizes again. Clear Proof returns state to idle. These operations add no backend task, worker, fake network delay, or unusable cancellation control.

The overview reads proof schema/algorithm versions, contract IDs, witness metadata, search seed, deltas, minimization budget, checks, exhaustion, and termination directly from the saved proof; verification counts come from the actual verifier payload. Before/after summaries read each Scenario and Comparison, with exact shared USD formatting and the existing Gregorian calendar helpers. Zero purchases/payments, cross-month paid dates, and negative deltas remain valid presentation inputs. Reduction may decrease absolute delta while preserving its nonzero sign.

The accepted-step timeline reads only `proof.reductionSteps`; rejected candidates are not invented as steps. Initially at most ten steps are mounted, and a native Show More control incrementally exposes another batch. Each displayed step identifies its number, type, reason, before/after purchase counts and totals, payment delays, delta, and accepted comparison. An empty sequence has an explicit no-accepted-steps message. Detailed transaction traces are rendered only when needed, so a maximum-budget proof does not mount every step's full scenario and calculation trace at once.

| Operation | Proof validity behavior |
| --- | --- |
| Select a different retained witness | Clear proof and verification; preserve the current search report. |
| Rerun search, including a failed attempt | Clear proof before replacing the search context. |
| Edit any search control | Clear search result, witness selection, proof, and verification. |
| Edit maxChecks | Clear prior proof and verification; require explicit generation with the new budget. |
| Valid Financial Diff Apply | Clear snapshot and proof; retain current controls for explicit reruns. |
| Reset to Original or choose a different experiment | Restore original contracts, default search controls, and maxChecks 200; clear result, selection, proof, and errors. |
| Pending Financial Diff edits, invalid Apply, same-witness selection, or view navigation | Preserve still-valid snapshot and proof; explain when unapplied text differs from saved contracts. |

All proof state lives in the existing React workspace, with no automatic browser, URL, or server persistence. Reload clears it; explicit Stage 5C-2 downloads save files under user control. Verification establishes arithmetic, Scenario, and reduction consistency with the current engine; it is not a digital signature, immutable provenance guarantee, historical-search authentication, or regulatory certification. `strategy-complete` refers only to the defined reduction probes and search bounds, not global minimality. See [PROOF_VIEWER_UI.md](PROOF_VIEWER_UI.md).

## Portable evidence and import isolation

The existing `useWorkspace` hook holds separate `ImportedProofState` and `evidenceView` state alongside current ProofState. Imports do not call contract Apply, overwrite SearchSnapshot, create a Hunter Witness, or edit fixtures. Current contract changes, Reset, selection changes, search, and generation retain independently verified imported evidence; its embedded contracts remain authoritative. Clear Imported Proof clears only imported state, while Clear Proof keeps its current-workspace meaning. Reload clears both.

Evidence Actions selects Current Workspace Proof or Imported Proof. Only the selected proof's success state enables downloads. JSON preparation calls `verifyImpactProof` again, then serializes the entire verified proof with `JSON.stringify(proof, null, 2)`. Markdown preparation calls only the unchanged `formatImpactReport`, which verifies before formatting. Both preserve official failure issues instead of creating a fake report. Downloads use a native Blob and temporary anchor, remove the anchor in `finally`, and revoke the Object URL on the next event-loop task after click dispatch. There is no upload, fetch, cloud storage, or PDF pipeline.

File import accepts a native File with an inclusive 5 MiB byte limit. It rejects missing or oversized files before reading, reads an ArrayBuffer through FileReader, checks actual byte length again, uses a fatal UTF-8 TextDecoder, and catches JSON syntax exceptions. `ImpactProofSchema.safeParse` enforces the unchanged strict root/nested structures and version 1; only then does `verifyImpactProof` recompute fees and enforce reduction constraints. File extensions and MIME types are convenience hints, never proof authority. The 5 MiB limit bounds file allocation and is independent of USD safe-integer monetary bounds.

Imported state distinguishes idle, reading, import failure, verification failure, and success. Starting another read removes prior success immediately. A monotonically advancing request ref ignores old read successes, failures, or exceptions after a newer selection; clear and unmount invalidate pending requests. Only the verified proof, verifier payload, and display filename are retained, without raw JSON text, bytes, File handles, or unnecessary content copies. Verify Imported Proof Again calls the official verifier against saved embedded evidence without reusing a self-claimed status.

Only the selected evidence body is mounted. The imported body reuses ProofOverview, BeforeAfterComparison, ReductionTimeline, Financial Explanation, and limitations. It uses embedded Contract IDs and witness metadata without attaching the active experiment's name. The interface explicitly states: “Imported proof verified independently against its embedded contracts.” React's default text rendering displays imported names and filenames as inert content. It does not interpret HTML, execute JavaScript/Markdown, or load external URLs, images, or scripts from imported data. No LocalStorage, SessionStorage, or IndexedDB is used. See [PORTABLE_EVIDENCE.md](PORTABLE_EVIDENCE.md).

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

The dashboard formatter validates safe integer cents and uses integer quotient/remainder arithmetic to construct dollar and two-digit cent strings, including the sign and thousands separators. It does not format money by dividing a floating-point number by 100. This preserves exact display up to `Number.MAX_SAFE_INTEGER`, including negative differences and zero. The formatter is presentation-only and does not recalculate any fees.

See [CALCULATION_ENGINE.md](CALCULATION_ENGINE.md) for formulas, the Gregorian ordinal algorithm, public result structures, trace fields, failure paths, and worked fixture calculations.

## Quality checks

The local development baseline is Node.js 24 LTS and npm. TypeScript strict mode, ESLint, and Vitest provide separate checks for type correctness, code quality, and executable behavior.

Zod is the only runtime dependency added for Stage 2. Runtime tests verify the real validators, including fixtures, invalid amounts, calendar edge cases, rule structures, strict keys, array bounds, duplicate IDs, early and cross-month payments, JSON round trips, and determinism.

Stage 3 adds no dependencies. Its Node.js unit tests exercise the formal fixtures and readable financial boundaries: waiver thresholds, per-transaction half-cent rounding, combined rules, absent rules, Gregorian date boundaries, overflow, validation failures, negative/zero comparisons, input immutability, JSON round trips, trace sums, and category-delta sums. The Stage 1 and Stage 2 suites remain in place.

Stage 4A preserves all 359 existing tests and adds Node.js search tests for discoveries from zero-delta bases, seeded reproducibility and variation, actual comparison consistency, formal scenario validation, bounds and budgets, deduplication, both delta directions, scoped no-witness results, overflow, calendar generation, immutability, and JSON serialization. It adds no runtime dependency.

Stage 4B preserves all 497 existing tests and adds runtime tests for real searched-witness reduction, positive and negative deltas, nonzero direction preservation, reduced absolute differences, budgets, forged evidence rejection, obligation/date/range invariants, overflow, immutable inputs, deterministic reruns, JSON proof round trips, tamper rejection, and Markdown consistency. It adds no dependency and does not change the existing financial formulas or search API.

Stage 5A adds jsdom and React Testing Library as development dependencies for real rendered-selector interactions. The pure financial suites continue to use the Node.js environment. Dashboard tests check brand and semantic structure, default selection, switching across all three experiments, engine-derived summaries and categories, real trace details, structured errors, unchanged fixtures, local-only behavior, and exact USD formatting. The historical overview assertions are updated for the now-interactive screen while preserving its brand, accessibility, status, and local-resource checks. Runtime dependencies remain React, React DOM, and Zod.

Stage 5B-1 preserves the existing suites while updating obsolete Planned/navigation expectations to the operational Financial Diff view. React Testing Library exercises navigation, atomic Apply, validation failures, Reset, selection changes, pending versus applied state, Old/New edits, waiver-kind switching, actual engine results, accessibility labels, and local-only behavior. Pure TypeScript parser tests cover canonical input, exact cents at the safe-integer boundary, numeric ranges, strict objects, unchanged metadata, frozen fixtures, and deterministic results. No dependencies are added, and the financial core APIs and formulas remain unchanged.

Stage 5B-2 preserves the existing suites and updates the obsolete Hunter Planned expectation for its operational navigation. New pure TypeScript tests exercise exact search-option conversion, every limit and paired range, strict draft inputs, neutral scenario validation, independent frozen obligations, original invalid dates, JSON serialization, and determinism. React Testing Library tests use real Stage 4A searches for the three official experiments, applied versus pending contracts, report invalidation and view persistence, witness selection, bounded work, structured errors, coverage wording, local-only behavior, and accessible controls. Responsive browser checks target 320, 390, 768, and 1440px. Runtime dependencies and core algorithms remain unchanged.

Stage 5C-1 preserves all 945 existing tests and updates the obsolete Proof Planned/navigation expectation. New pure tests validate exact minimization-budget drafts, schema defaults, boundaries, arbitrary unknown input, immutability, JSON-safe results, and determinism. React Testing Library uses real Stage 4A searched witnesses and Stage 4B creation/verification for the three formal experiments, plus positive/negative directions, budget exhaustion, accepted-step pagination, invalidations, pending drafts, repeated verification, structured failures, forged fee rejection, frozen data, local-only operation, and accessible controls. Responsive browser checks target the same four widths. No financial-core or fixture tests are removed.

Stage 5C-2 preserves the 1,039 existing tests. Real File/Blob tests exercise complete JSON round trips, official Markdown output, strict UTF-8/JSON/schema checks, tampered fees/reductions/obligations, exact file-size boundaries, untrusted filenames/MIME, and native Object URL cleanup. React DOM tests use real evidence alongside controlled failure/race cases to verify source separation, stale-read rejection, current workspace preservation, retry/clear behavior, safe text rendering, accessibility, and no runtime requests or browser persistence. Responsive browser checks target 320, 390, 768, and 1440px. Runtime dependencies, proof format, financial cores, and formal fixtures remain unchanged.

GitHub Actions runs `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` on pushes and pull requests through the unchanged CI workflow. The deployment workflow repeats these checks before publishing. The complete Stage 7A suite contains 1,161 tests, including the retained financial, search, minimization, proof, and evidence cases. A committed `package-lock.json` supports reproducible dependency installation. Secrets, dependency directories, and build artifacts must not be committed.

## GitHub Pages deployment

GitHub Pages hosts the public repository's built static files. Vite's base path stays `/termshift-finance-lab/`; generated JavaScript, CSS, and local asset URLs resolve under that project path. The HTML favicon uses Vite's `%BASE_URL%` placeholder. The application has no URL routing, React Router, or deployment-specific SPA fallback.

`.github/workflows/deploy.yml` runs on main pushes and manual dispatch, using Node.js from `.nvmrc`. It uploads only the verified `dist/` directory with the official Pages artifact action and deploys through the `github-pages` environment. Pull requests retain ordinary CI without publishing. The build uses read access to repository contents and Pages configuration; the deployment job receives only the Pages and OIDC permissions needed to publish. Actions use immutable commit pins, and deployment concurrency serializes publication with only the latest pending run retained. No private token or hardcoded secret is required.

The deployment workflow adds `dist/build-info.json` after the production build, with a `commit` field containing the full source commit SHA and no timestamp. It is static build output, excluded from Git, and inspected directly during deployment verification. The React application does not fetch it at runtime. Verification must match that SHA to the successful workflow run and repository main, inspect the `github-pages` deployment, obtain the official Pages URL, and exercise the actual public website. A successful ordinary CI run alone does not prove deployment or current-version delivery.

Repository Settings → Pages uses **GitHub Actions** as its source. The production browser downloads the site's own HTML, JavaScript, CSS, favicon, and local assets from GitHub Pages, then runs all financial operations and proof file handling locally. Static hosting does not add a backend, API, database, login, analytics, or remote evidence upload. See [DEPLOYMENT.md](DEPLOYMENT.md) for setup, redeployment, asset-path troubleshooting, and the production verification procedure.
