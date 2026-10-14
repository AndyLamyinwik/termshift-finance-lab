# TermShift

**Financial Contract Counterexample Lab**

TermShift is an explainable financial contract simulation and counterexample discovery engine. It aims to help people compare contract rules, discover scenarios where their outcomes differ, and understand the impact of those differences.

**Project in Development — Stage 5A: Interactive Financial Dashboard**

TermShift now provides a local financial analysis dashboard for three synthetic experiments. Select an experiment to compare the old and new contracts, inspect category fees, and expand the actual calculation traces. Every displayed financial result comes from the existing comparison engine. The repository also contains validated contract and scenario models, bounded counterexample search, witness minimization, and verifiable impact evidence; their dedicated search and proof interfaces remain planned for Stage 5B and Stage 5C.

## Technology

- React and TypeScript with strict type checking
- Vite for local development and production builds
- npm with a committed lockfile
- Vitest for automated tests, with jsdom and React Testing Library for dashboard interaction tests
- ESLint for code quality
- GitHub Actions for continuous integration
- Zod for runtime validation of contract and scenario inputs

The application is a single static frontend. It has no backend, database, authentication, or runtime third-party API calls. The calculation core is pure TypeScript, runs independently in Node.js tests, and powers the dashboard locally in the browser without React or DOM dependencies. The interface uses local CSS, system fonts, and local visual assets. jsdom and React Testing Library are development dependencies only; Stage 5A adds no runtime dependency or UI framework.

## Getting started

Use Node.js 24 LTS and npm. The repository includes an `.nvmrc` containing `24` for environments that support it.

```sh
git clone https://github.com/AndyLamyinwik/termshift-finance-lab.git
cd termshift-finance-lab
npm ci
npm run dev
```

Open the local URL printed by Vite, normally `http://localhost:5173/termshift-finance-lab/`. The dashboard initially shows The Waiver Trap. Use the labeled experiment selector to switch to The Microtransaction Penalty or The Grace Period Shift, then expand Calculation Details to inspect the old and new contract traces. Vite is configured with the base path `/termshift-finance-lab/` for the future GitHub Pages target. Deployment is reserved for Stage 6 and is not configured here.

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
- Old Contract Cost, New Contract Cost, and Cost Difference summaries; monthly, transaction, and late-fee comparisons with readable amounts and CSS bars; expandable traces for both contract versions.
- Explicit increase, decrease, and equal-cost text alongside visual states, an assistive-technology announcement of result changes, and structured engine errors without fabricated success values.
- React-independent Contract v1 and Scenario v1 schemas with strict runtime validation and structured errors for unknown inputs.
- Monthly fee, transaction fee, and late fee rule data types, restricted to USD cents and integer basis points.
- Three complete synthetic experiments: The Waiver Trap, The Microtransaction Penalty, and The Grace Period Shift.
- Pure TypeScript evaluation and comparison APIs with exact integer arithmetic, per-transaction half-up rounding, Gregorian calendar-day calculations, structured traces, and explicit validation/overflow failures.
- A local deterministic search API that starts from an explicit base scenario, explores bounded uniform-purchase/shared-payment-delay scenarios, and retains complete witnesses computed by the existing comparison engine.
- A deterministic, bounded minimizer that validates and recomputes each witness, reduces purchases, amounts, and payment delays, and preserves payment obligations and a nonzero delta with the same sign.
- JSON-safe Proof of Impact data, runtime proof verification through fresh engine comparisons, and a pure Markdown report formatter.
- Executable dashboard interaction, exact amount formatting, runtime validation, calculation, search, minimization, and proof tests, linting, type checking, and build scripts.
- Engineering documentation, an MIT license, and a GitHub Actions CI workflow.

The dashboard uses React state to select a fixture from `src/scenarios/`, then calls `compareContracts(experiment.oldContract, experiment.newContract, experiment.scenario)` from `src/engine/index.ts`. Summary values and fee breakdowns come directly from the returned `Comparison`; Calculation Details render the discriminated `Evaluation.trace` records. A failed comparison displays its structured issues instead of substituting zero fees. Selecting an experiment does not mutate the fixtures. There are no runtime API requests, account services, scenario editors, or search/proof controls.

Presentation code lives in `src/features/dashboard/`, separate from the financial core. The amount formatter converts safe integer cents to exact whole-dollar and two-digit cent strings with integer arithmetic, including signed differences and large values. Chart widths are visual ratios only; they do not calculate or replace the monetary values shown as text.

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
| Financial Diff | Stage 5A dashboard compares fees and calculation traces for the three formal experiments. General contract editing and structural rule diffs remain future work. |
| Counterexample Hunter | Core search and minimization APIs are implemented. A dedicated interactive search interface is Planned for Stage 5B. |
| Proof of Impact | Core JSON evidence, verification, and Markdown APIs are implemented. A dedicated interactive proof interface is Planned for Stage 5C. |

The planned search and proof interfaces are described as future work, with no inactive navigation or pretend controls. Stage 5A does not implement Stage 5B, Stage 5C, or Stage 6 GitHub Pages deployment. The current model supports USD only, with amounts stored as integer cents. Future currency support must declare each currency's unit scale instead of assuming all currencies have two decimal places.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for frontend constraints and module boundaries, [docs/FINANCIAL_MODEL.md](docs/FINANCIAL_MODEL.md) for input fields and validation requirements, [docs/CALCULATION_ENGINE.md](docs/CALCULATION_ENGINE.md) for formulas and calculation traces, [docs/COUNTEREXAMPLE_SEARCH.md](docs/COUNTEREXAMPLE_SEARCH.md) for search options and coverage limits, and [docs/MINIMIZATION_AND_PROOF.md](docs/MINIMIZATION_AND_PROOF.md) for reduction APIs, proof verification, and reproducible synthetic results.

## License

TermShift is released under the [MIT License](LICENSE).
