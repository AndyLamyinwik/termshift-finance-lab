# TermShift

**Financial Contract Counterexample Lab**

TermShift is an explainable financial contract simulation and counterexample discovery engine. It aims to help people compare contract rules, discover scenarios where their outcomes differ, and understand the impact of those differences.

**Project in Development — Stage 5B-1: Interactive Financial Rule Comparator**

TermShift provides a local dashboard and Financial Diff workspace for three synthetic experiments. Select an experiment, edit the existing old and new contract rules, then apply validated changes to compare costs under the same scenario. Both views share the current working contracts and display results from the existing comparison engine. Changes remain in page memory and disappear on reload. The repository also contains validated models, bounded counterexample search, witness minimization, and verifiable impact evidence; their dedicated search and proof interfaces remain planned for Stage 5B-2 and Stage 5C.

## Technology

- React and TypeScript with strict type checking
- Vite for local development and production builds
- npm with a committed lockfile
- Vitest for automated tests, with jsdom and React Testing Library for rendered workspace interactions
- ESLint for code quality
- GitHub Actions for continuous integration
- Zod for runtime validation of contract and scenario inputs

The application is a single static frontend. It has no backend, database, authentication, or runtime third-party API calls. The calculation core is pure TypeScript, runs independently in Node.js tests, and powers both views locally in the browser without React or DOM dependencies. The interface uses local CSS, system fonts, and local visual assets. jsdom and React Testing Library are development dependencies only; Stage 5B-1 uses the existing dependencies without adding a UI framework or runtime package.

## Getting started

Use Node.js 24 LTS and npm. The repository includes an `.nvmrc` containing `24` for environments that support it.

```sh
git clone https://github.com/AndyLamyinwik/termshift-finance-lab.git
cd termshift-finance-lab
npm ci
npm run dev
```

Open the local URL printed by Vite, normally `http://localhost:5173/termshift-finance-lab/`. The Dashboard initially shows The Waiver Trap. Use the experiment selector to change experiments and the sidebar buttons to open Financial Diff. Edit rules there, choose **Apply Changes**, then return to Dashboard to inspect the updated summaries and Calculation Details. **Reset to Original** restores both original contracts. Selecting a different experiment discards drafts and applied changes; reloading starts again with the original Waiver Trap. See the [Financial Diff guide](docs/FINANCIAL_DIFF.md) for input units and examples. Vite is configured with `/termshift-finance-lab/` for the future GitHub Pages target. Deployment is reserved for Stage 6 and is not configured here.

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

The CI workflow runs this verification sequence on pushes and pull requests. The repository does not include a deployment workflow.

## Current scope

- A React, TypeScript, and Vite application foundation.
- A responsive dark dashboard with TermShift branding, a visible development status, and a labeled, keyboard-operable selector for the three formal experiments.
- A Financial Diff view for editing existing monthly, transaction, and late-fee rules on independent working copies, with atomic validation and Apply/Reset controls.
- Shared in-memory workspace state that preserves applied contracts and unapplied text drafts when navigating between Dashboard and Financial Diff.
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

`App.tsx` owns a shared workspace through `src/features/workspace/useWorkspace.ts` and passes it to both views. Selecting an experiment clones its formal contracts from `src/scenarios/`; the original fixture scenario remains unchanged. Applied contracts feed `compareContracts(workingOldContract, workingNewContract, selectedExperiment.scenario)` from `src/engine/index.ts`. Summary values and category differences come directly from its `Comparison`, and Calculation Details render the discriminated `Evaluation.trace` records. A failed comparison displays its structured issues instead of substituting zero fees. There are no runtime API requests, account services, scenario editors, or search/proof controls.

Financial Diff keeps raw text drafts separate from applied contracts. Apply validates both drafts with the exact input parser and Stage 2 `validateContract`, then updates both working contracts together. Invalid inputs remain available for correction, field errors explain the problem, and results continue to use the last applied contracts. A valid contract can still cause calculation overflow; that engine failure is displayed with its original issue codes and paths. Modified contracts retain their IDs and version metadata and are visibly labeled as working copies. No changes are written to fixtures, browser storage, or a server.

USD input accepts non-negative decimal strings such as `12.50`, with at most two decimal places. The parser bounds numeric input to 24 characters and uses `BigInt` to form cents exactly, up to `90071992547409.91` USD (`Number.MAX_SAFE_INTEGER` cents). It rejects blank text, signs, spaces, leading zeros, scientific notation, fractional integer fields, and other invalid formats without automatic correction. Waiver counts and purchase totals must be positive; basis points are integers from 0 to 10,000, and grace days are non-negative safe integers. Final numeric rule values pass the existing formal Contract schema.

Presentation and state code live in `src/features/dashboard/`, `src/features/financial-diff/`, and `src/features/workspace/`, separate from the financial core. The Stage 5A amount formatter converts safe integer cents to exact whole-dollar and two-digit cent strings with integer arithmetic, including signed differences and large values. Both views reuse it. Chart widths are visual ratios only; they do not calculate or replace the monetary values shown as text.

The public data model API is exported from `src/models/index.ts`; synthetic fixtures are exported from `src/scenarios/index.ts`. Validation accepts `unknown` and returns either validated data or issues with a field path, code, and message. It checks actual Gregorian calendar dates without JavaScript date normalization, rejects unknown object fields, and bounds scenario inputs to 10,000 transactions and 1,000 payment events. Models and validators run in the Node.js test environment without React, browser APIs, a clock, random values, or network access.

The public calculation API is exported from `src/engine/index.ts`. `evaluateContract(contractInput, scenarioInput)` and `compareContracts(oldContractInput, newContractInput, scenarioInput)` accept `unknown`, use the existing runtime validators, and return `{ success: true, data }` or `{ success: false, issues }`. A comparison evaluates both contracts against the same scenario; positive deltas mean the new contract costs more and negative deltas mean it costs less. Calculation inputs are not mutated, and results contain JSON-safe integer numbers rather than `bigint`.

The public search API is exported from `src/search/index.ts`. `searchCounterexamples(oldContractInput, newContractInput, baseScenarioInput, optionsInput)` also accepts `unknown` and returns a validated report or structured issues. Its required options declare a seed, inclusive purchase-count/amount/delay bounds, an evaluation budget, and a witness limit. Search is limited to 30 purchases, five existing payment events, 500 comparisons, and ten retained witnesses; oversized base inputs are rejected without truncation. Every candidate passes the existing Scenario validator before `compareContracts` is called. The report records candidate sources, failures, skips, actual evaluation counts, and coverage of its simplified generated family.

Repeating the same inputs, options, seed, and code revision reproduces candidate order and results. No-witness results mean no difference was found within the declared range and budget. The strongest observed witness is not asserted to be a global maximum. `coverage.complete` means every canonical parameter tuple in the generated family was visited; some visits can fail date generation or financial calculation. It does not establish successful financial evaluation of every tuple or general contract equivalence.

The public minimizer API is exported from `src/minimizer/index.ts`. `minimizeWitness(oldContractInput, newContractInput, witnessInput, searchOptionsInput, minimizationOptionsInput)` accepts unknown inputs and returns validated reduction evidence or structured issues. It first recomputes the recorded witness using `compareContracts`; forged comparisons, mismatched deltas, and zero-delta witnesses fail. It minimizes the lexicographic tuple of purchase count, total purchase cents, and total nonnegative late days, within the original search bounds. Its comparison budget defaults to 200 and cannot exceed 300, including the original comparison and failed candidate calculations. A returned result describes reduction under a finite strategy and budget, without claiming a global minimum.

The public evidence API is exported from `src/proof/index.ts`. `createImpactProof` takes the same inputs as the minimizer, `verifyImpactProof(unknown)` validates a saved proof and recomputes its financial results, and `formatImpactReport(unknown)` returns a verified Markdown report or structured issues. Proofs preserve contracts, search options and seed, witness source, original and reduced scenarios, comparisons, accepted steps, budget, calculation policy, and limitations. Verification checks calculation consistency and reduction invariants; it does not certify past search history or provide a cryptographic signature. The evidence APIs remain independent of the dashboard and have no runtime network call or PDF output.

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
| Counterexample Hunter | Core search and minimization APIs are implemented. A dedicated interactive search interface is Planned for Stage 5B-2. |
| Proof of Impact | Core JSON evidence, verification, and Markdown APIs are implemented. A dedicated interactive proof interface is Planned for Stage 5C. |

The planned search and proof interfaces have explanatory labels rather than inactive navigation or pretend controls. Stage 5B-1 does not implement Stage 5B-2 search UI, Stage 5C Proof UI, or Stage 6 GitHub Pages deployment. Rule-category additions/removals, scenario editing, general contract metadata editing, structural rule diffs, import/export, and PDF output are outside this stage. The current model supports USD only, with amounts stored as integer cents. Future currency support must declare each currency's unit scale instead of assuming all currencies have two decimal places.

See [docs/FINANCIAL_DIFF.md](docs/FINANCIAL_DIFF.md) for workspace usage, [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for frontend constraints and module boundaries, [docs/FINANCIAL_MODEL.md](docs/FINANCIAL_MODEL.md) for input fields and validation requirements, [docs/CALCULATION_ENGINE.md](docs/CALCULATION_ENGINE.md) for formulas and calculation traces, [docs/COUNTEREXAMPLE_SEARCH.md](docs/COUNTEREXAMPLE_SEARCH.md) for search options and coverage limits, and [docs/MINIMIZATION_AND_PROOF.md](docs/MINIMIZATION_AND_PROOF.md) for reduction APIs, proof verification, and reproducible synthetic results.

## License

TermShift is released under the [MIT License](LICENSE).
