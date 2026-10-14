# TermShift

[Live Demo — Public Preview](https://andylamyinwik.github.io/termshift-finance-lab/)

**Financial Contract Counterexample Lab**

TermShift is an explainable financial contract simulation and counterexample discovery engine. It aims to help people compare contract rules, discover scenarios where their outcomes differ, and understand the impact of those differences.

**Project in Development — Stage 6: GitHub Pages Public Preview**

TermShift provides a local Dashboard, Financial Diff editor, Counterexample Hunter, and Proof of Impact Viewer for three synthetic experiments. Select an experiment, apply validated contract changes, search for differing outcomes, then reduce a selected witness and verify its calculation evidence. Download complete Proof JSON or a readable Markdown report, and independently verify saved JSON from a local file. All financial results come from the existing engine and evidence APIs. Settings, working contracts, search results, and current/imported proofs remain in page memory and disappear on reload; only an explicit download saves a file.

## Technology

- React and TypeScript with strict type checking
- Vite for local development and production builds
- npm with a committed lockfile
- Vitest for automated tests, with jsdom and React Testing Library for rendered workspace interactions
- ESLint for code quality
- GitHub Actions for continuous integration
- Zod for runtime validation of contract and scenario inputs

The application is a single static frontend. It has no backend, database, authentication, or runtime third-party API calls. The calculation, search, minimization, and proof cores are pure TypeScript, run independently in Node.js tests, and power the views locally in the browser without React or DOM dependencies. The interface uses local CSS, system fonts, and local visual assets. jsdom and React Testing Library are development dependencies only; Stage 5C-2 uses existing dependencies and native browser file/download APIs without adding a UI framework or runtime package.

## Getting started

Use Node.js 24 LTS and npm. The repository includes an `.nvmrc` containing `24` for environments that support it.

```sh
git clone https://github.com/AndyLamyinwik/termshift-finance-lab.git
cd termshift-finance-lab
npm ci
npm run dev
```

Open the local URL printed by Vite, normally `http://localhost:5173/termshift-finance-lab/`. The Dashboard initially shows The Waiver Trap. Edit rules in **Financial Diff** and choose **Apply Changes**, then inspect Dashboard costs or choose **Run Search** in **Counterexample Hunter**. Select a retained witness, open **Proof of Impact**, set **Max Checks** (default 200; range 1–300), and choose **Generate Proof**. Inspect the original and reduced scenarios, accepted reduction steps, and actual verification result. **Verify Again** checks the saved proof without rerunning search or minimization. **Reset to Original** restores original contracts and default search/minimization controls and clears current workspace results. Selecting a different experiment discards drafts, applied changes, search results, and current workspace proofs; reloading starts again with the original Waiver Trap. See the [Financial Diff guide](docs/FINANCIAL_DIFF.md), [Counterexample Hunter guide](docs/COUNTEREXAMPLE_UI.md), and [Proof Viewer guide](docs/PROOF_VIEWER_UI.md) for usage and limits. Vite uses `/termshift-finance-lab/` for the GitHub Pages project path. The [deployment guide](docs/DEPLOYMENT.md) explains publication and verification.

In Proof of Impact, **Evidence Actions** lets you choose **Current Workspace Proof** or **Imported Proof**. Download buttons are enabled only for a verified proof in the selected view. **Download JSON** saves `termshift-impact-proof.json`; **Download Markdown** saves `termshift-impact-report.md`. Use **Import Proof JSON** to select a local UTF-8 JSON file up to 5 MiB. The app checks the official schema and independently recalculates evidence against its embedded contracts; it does not replace working contracts, search results, or the current workspace proof. **Verify Imported Proof Again** rechecks that saved evidence, and **Clear Imported Proof** clears only the imported state. Apply, Reset, and switching experiments invalidate current workspace results while preserving independently imported evidence. JSON can be reverified; Markdown is a readable report and does not replace complete evidence. Verified is calculation consistency, not a digital signature or authenticated authorship. See the [Portable Evidence guide](docs/PORTABLE_EVIDENCE.md).

## Development commands

| Command | Purpose |
| --- | --- |
| `npm ci` | Install the exact dependencies recorded in `package-lock.json`. |
| `npm run dev` | Start the local Vite development server. |
| `npm run build` | Produce the static production build in `dist/`. |
| `npm run lint` | Run ESLint. |
| `npm run typecheck` | Check TypeScript types without emitting JavaScript. |
| `npm test` | Run the Vitest suite once. |

Before committing changes, run:

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

The unchanged CI workflow runs this verification sequence on pushes and pull requests. The separate Pages deployment workflow repeats these checks on main pushes or manual dispatch, then uploads `dist/` and publishes it to the `github-pages` environment. Pull requests do not publish.

## Public preview deployment

GitHub Pages serves the verified static build at the Live Demo link above. Repository Settings → Pages uses **GitHub Actions** as its Source. Official Actions are pinned to release commit SHAs; Node.js comes from `.nvmrc`. Build jobs have read-only source/Pages permissions, and the deployment job has only Pages write and OIDC permissions. Production runs are serialized with only the newest pending run retained. No private deployment token is needed.

For a manual redeployment, open **Actions → Deploy to GitHub Pages → Run workflow**, select **main**, and wait for both jobs to succeed. Confirm the ordinary CI, the Pages deployment environment, and the public URL separately. The deployed [`build-info.json`](https://andylamyinwik.github.io/termshift-finance-lab/build-info.json) records the exact source commit in its `commit` field; compare it with main and the successful workflow. The application does not fetch this metadata during use.

Normal browser requests load HTML, JS, CSS, and the local favicon from Pages. Financial calculations and evidence import/export run locally, without a backend, runtime API, file upload, tracking, or browser permanent storage. Public Preview is not v1.0.0 or a financial regulatory certification. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for asset-path troubleshooting and the production smoke checklist.

## Current scope

- A React, TypeScript, and Vite application foundation.
- A responsive dark dashboard with TermShift branding, a visible development status, and a labeled, keyboard-operable selector for the three formal experiments.
- A Financial Diff view for editing existing monthly, transaction, and late-fee rules on independent working copies, with atomic validation and Apply/Reset controls.
- A Counterexample Hunter view with validated seed, range, and budget controls, real local search, truthful report statistics, and selectable witnesses with scenario and financial evidence.
- A Proof of Impact view that explicitly minimizes a selected searched witness, independently verifies the returned proof, compares original/reduced evidence, and incrementally presents accepted steps.
- Native local downloads of full, freshly verified Proof JSON and the existing formatter's Markdown report, plus bounded UTF-8 JSON import and independent embedded-contract verification.
- A distinct Imported Evidence view that reuses the proof presentation, preserves current workspace evidence, and handles malformed files, failed verification, and overlapping file reads.
- Shared in-memory workspace state that preserves applied contracts, unapplied text drafts, search settings, results, witness selection, minimization controls, and still-valid proofs across all four views.
- Old Contract Cost, New Contract Cost, and Cost Difference summaries; monthly, transaction, and late-fee comparisons with readable amounts and CSS bars; expandable traces for both contract versions.
- Explicit increase, decrease, and equal-cost text alongside visual states, an assistive-technology announcement of result changes, and structured engine errors without fabricated success values.
- React-independent Contract v1 and Scenario v1 schemas with strict runtime validation and structured errors for unknown inputs.
- Monthly fee, transaction fee, and late fee rule data types, restricted to USD cents and integer basis points.
- Three complete synthetic experiments: The Waiver Trap, The Microtransaction Penalty, and The Grace Period Shift.
- Pure TypeScript evaluation and comparison APIs with exact integer arithmetic, per-transaction half-up rounding, Gregorian calendar-day calculations, structured traces, and explicit validation/overflow failures.
- A local deterministic search API that starts from an explicit base scenario, explores bounded uniform-purchase/shared-payment-delay scenarios, and retains complete witnesses computed by the existing comparison engine.
- A deterministic, bounded minimizer that validates and recomputes each witness, reduces purchases, amounts, and payment delays, and preserves payment obligations and a nonzero delta with the same sign.
- JSON-safe Proof of Impact data, runtime proof verification through fresh engine comparisons, and a pure Markdown report formatter.
- Executable workspace interaction, exact amount input/formatting, runtime validation, calculation, search, minimization, and proof tests, linting, type checking, and build scripts.
- Engineering documentation, an MIT license, and a GitHub Actions CI workflow.

`App.tsx` owns a shared workspace through `src/features/workspace/useWorkspace.ts` and passes it to all four views. Selecting an experiment clones its formal contracts from `src/scenarios/`; the original fixture scenario remains unchanged. Dashboard and Financial Diff feed applied contracts into `compareContracts(workingOldContract, workingNewContract, selectedExperiment.scenario)` from `src/engine/index.ts`. Summary values and category differences come directly from its `Comparison`, and Calculation Details render the discriminated `Evaluation.trace` records. A failed comparison displays its structured issues instead of substituting zero fees. There are no runtime API requests, account services, or scenario editors.

Financial Diff keeps raw text drafts separate from applied contracts. Apply validates both drafts with the exact input parser and Stage 2 `validateContract`, then updates both working contracts together. Invalid inputs remain available for correction, field errors explain the problem, and results continue to use the last applied contracts. A valid contract can still cause calculation overflow; that engine failure is displayed with its original issue codes and paths. Modified contracts retain their IDs and version metadata and are visibly labeled as working copies. No changes are written to fixtures, browser storage, or a server.

USD input accepts non-negative decimal strings such as `12.50`, with at most two decimal places. The parser bounds numeric input to 24 characters and uses `BigInt` to form cents exactly, up to `90071992547409.91` USD (`Number.MAX_SAFE_INTEGER` cents). It rejects blank text, signs, spaces, leading zeros, scientific notation, fractional integer fields, and other invalid formats without automatic correction. Waiver counts and purchase totals must be positive; basis points are integers from 0 to 10,000, and grace days are non-negative safe integers. Final numeric rule values pass the existing formal Contract schema.

Hunter creates a separate Search Starting Scenario from the formal scenario: no purchases, all original payment obligations retained, and each existing payment marked paid on its due date. Stage 2 validates this copy and Stage 3 compares it against the applied contracts when Hunter is open. The three unmodified experiments have zero starting difference; changed working terms may have a nonzero starting difference, which is displayed as computed. Only **Run Search** calls `searchCounterexamples(workingOldContract, workingNewContract, searchBase, searchOptions)`. Pending Financial Diff drafts do not affect it and have a visible reminder.

Successful search snapshots retain independent old/new contracts, the search base, numeric options, the complete `SearchReport`, and the selected witness ID in the existing workspace. Parameter changes and valid Apply clear results; Reset and a different experiment also restore search defaults. Invalid Apply and view navigation preserve still-valid results. Hunter renders at most ten retained witnesses and the selected witness's actual scenario and `Comparison`; it does not render the complete candidate ledger or run the minimizer.

Proof generation resolves the selected witness inside the current successful search snapshot and passes that snapshot's detached contracts, numeric search options, and witness to Stage 4B `createImpactProof`. A returned proof becomes **Verified** only after `verifyImpactProof` succeeds; failures retain structured code/path/message issues without a success label or invented fees. Changing witness, rerunning search, editing search or minimization controls, valid Apply, Reset, and a different experiment clear proof state. Pending Financial Diff text, invalid Apply, and view navigation preserve still-valid evidence. Accepted steps appear ten at a time, with **Show More** for the next batch; the UI does not mount all possible 299 steps or all their transactions at once. Verification checks arithmetic, scenario validity, and reduction constraints under the current engine. It provides neither a digital signature nor a guarantee of immutable historical provenance or a globally minimal witness.

Presentation and state code live in `src/features/dashboard/`, `src/features/financial-diff/`, `src/features/hunter/`, `src/features/proof-viewer/`, `src/features/portable-evidence/`, and `src/features/workspace/`, separate from the financial core. The Stage 5A amount formatter converts safe integer cents to exact whole-dollar and two-digit cent strings with integer arithmetic, including signed differences and large values. All views reuse it. Chart widths are visual ratios only; they do not calculate or replace the monetary values shown as text.

The public data model API is exported from `src/models/index.ts`; synthetic fixtures are exported from `src/scenarios/index.ts`. Validation accepts `unknown` and returns either validated data or issues with a field path, code, and message. It checks actual Gregorian calendar dates without JavaScript date normalization, rejects unknown object fields, and bounds scenario inputs to 10,000 transactions and 1,000 payment events. Models and validators run in the Node.js test environment without React, browser APIs, a clock, random values, or network access.

The public calculation API is exported from `src/engine/index.ts`. `evaluateContract(contractInput, scenarioInput)` and `compareContracts(oldContractInput, newContractInput, scenarioInput)` accept `unknown`, use the existing runtime validators, and return `{ success: true, data }` or `{ success: false, issues }`. A comparison evaluates both contracts against the same scenario; positive deltas mean the new contract costs more and negative deltas mean it costs less. Calculation inputs are not mutated, and results contain JSON-safe integer numbers rather than `bigint`.

The public search API is exported from `src/search/index.ts`. `searchCounterexamples(oldContractInput, newContractInput, baseScenarioInput, optionsInput)` also accepts `unknown` and returns a validated report or structured issues. Its required options declare a seed, inclusive purchase-count/amount/delay bounds, an evaluation budget, and a witness limit. Search is limited to 30 purchases, five existing payment events, 500 comparisons, and ten retained witnesses; oversized base inputs are rejected without truncation. Every candidate passes the existing Scenario validator before `compareContracts` is called. The report records candidate sources, failures, skips, actual evaluation counts, and coverage of its simplified generated family.

Repeating the same inputs, options, seed, and code revision reproduces candidate order and results. No-witness results mean no difference was found within the declared range and budget. The strongest observed witness is not asserted to be a global maximum. `coverage.complete` means every canonical parameter tuple in the generated family was visited; some visits can fail date generation or financial calculation. It does not establish successful financial evaluation of every tuple or general contract equivalence.

The public minimizer API is exported from `src/minimizer/index.ts`. `minimizeWitness(oldContractInput, newContractInput, witnessInput, searchOptionsInput, minimizationOptionsInput)` accepts unknown inputs and returns validated reduction evidence or structured issues. It first recomputes the recorded witness using `compareContracts`; forged comparisons, mismatched deltas, and zero-delta witnesses fail. It minimizes the lexicographic tuple of purchase count, total purchase cents, and total nonnegative late days, within the original search bounds. Its comparison budget defaults to 200 and cannot exceed 300, including the original comparison and failed candidate calculations. A returned result describes reduction under a finite strategy and budget, without claiming a global minimum.

The public evidence API is exported from `src/proof/index.ts`. `createImpactProof` takes the same inputs as the minimizer, `verifyImpactProof(unknown)` validates a saved proof and recomputes its financial results, and `formatImpactReport(unknown)` returns a verified Markdown report or structured issues. Proofs preserve contracts, search options and seed, witness source, original and reduced scenarios, comparisons, accepted steps, budget, calculation policy, and limitations. Verification checks calculation consistency and reduction invariants; it does not certify past search history or provide a cryptographic signature. Native downloads and local file import use these unchanged APIs and Proof Schema Version 1. A 5 MiB import allocation limit applies before reading and to actual bytes; it is separate from safe-integer monetary limits. Filenames and MIME types do not determine validity. Imported strings are inert React text; there is no HTML/Markdown execution, external resource loading, file upload, or browser storage.

Contract `effectiveDate` is descriptive version metadata. It does not prevent a scenario from being used for a counterfactual comparison. Internal `bigint` arithmetic preserves monetary precision, and results outside the safe integer range fail explicitly. The completed-payment late fee is assessed separately for each synthetic payment event; it does not model real account-level bank late fees, balances, partial repayments, interest, or financial regulation.

The existing fixtures produce these calculated totals:

| Experiment | Old total (USD cents) | New total (USD cents) | New minus old (USD cents) |
| --- | ---: | ---: | ---: |
| The Waiver Trap | 0 | 1,200 | +1,200 |
| The Microtransaction Penalty | 10 | 210 | +200 |
| The Grace Period Shift | 0 | 1,500 | +1,500 |

These are computations over fictional inputs, not real product analyses or financial advice. Expected results belong in tests and documentation; fixtures retain their input data without embedded answers.

## Product modules and next stages

| Module | Current interface and intended role |
| --- | --- |
| Financial Diff | Implemented in Stage 5B-1: edit existing rules on old/new working contracts, apply validated changes, reset originals, and compare engine totals, category differences, and traces under the fixed experiment scenario. |
| Counterexample Hunter | Implemented in Stage 5B-2: search with applied working contracts, a neutral starting scenario, explicit validated seed/ranges/budget, report statistics, and selectable real witnesses. |
| Proof of Impact | Implemented in Stages 5C-1 and 5C-2: reduce and verify a searched witness, inspect original/reduced evidence and accepted steps, download complete JSON/readable Markdown, and independently verify local imported proof files. |

Stage 6 adds static GitHub Pages deployment to the existing interface. PDF generation, Release creation, a v1.0.0 tag, and subsequent stages remain outside this delivery. Rule-category additions/removals, scenario editing, general contract metadata editing, structural rule diffs, and standalone contract import/export remain outside the interface. The current model supports USD only, with amounts stored as integer cents. Future currency support must declare each currency's unit scale instead of assuming all currencies have two decimal places.

See [docs/FINANCIAL_DIFF.md](docs/FINANCIAL_DIFF.md) for editing, [docs/COUNTEREXAMPLE_UI.md](docs/COUNTEREXAMPLE_UI.md) for Hunter usage and report interpretation, [docs/PROOF_VIEWER_UI.md](docs/PROOF_VIEWER_UI.md) for proof controls and evidence limits, [docs/PORTABLE_EVIDENCE.md](docs/PORTABLE_EVIDENCE.md) for JSON/Markdown export and independent import, [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for frontend constraints and module boundaries, [docs/FINANCIAL_MODEL.md](docs/FINANCIAL_MODEL.md) for input fields and validation requirements, [docs/CALCULATION_ENGINE.md](docs/CALCULATION_ENGINE.md) for formulas and calculation traces, [docs/COUNTEREXAMPLE_SEARCH.md](docs/COUNTEREXAMPLE_SEARCH.md) for search options and coverage limits, and [docs/MINIMIZATION_AND_PROOF.md](docs/MINIMIZATION_AND_PROOF.md) for reduction APIs, proof verification, and reproducible synthetic results.

## License

TermShift is released under the [MIT License](LICENSE).
