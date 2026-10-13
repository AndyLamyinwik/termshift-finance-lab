# TermShift

**Financial Contract Counterexample Lab**

TermShift is an explainable financial contract simulation and counterexample discovery engine. It aims to help people compare contract rules, discover scenarios where their outcomes differ, and understand the impact of those differences.

**Project in Development — Stage 3: Financial Calculation Engine**

This repository contains the frontend foundation, a responsive project overview, validated financial contract and scenario data models, and a deterministic financial calculation and counterfactual comparison engine. The engine evaluates explicit synthetic scenarios and returns fee totals and structured calculation traces. Automatic counterexample searches and an interactive analysis interface remain future work.

## Technology

- React and TypeScript with strict type checking
- Vite for local development and production builds
- npm with a committed lockfile
- Vitest for automated tests
- ESLint for code quality
- GitHub Actions for continuous integration
- Zod for runtime validation of contract and scenario inputs

The application is a single static frontend. It has no backend, database, authentication, or runtime third-party API calls. The calculation core is pure TypeScript, runs in Node.js tests, and is suitable for future local browser use without React or DOM dependencies. The interface uses local CSS and does not load remote fonts, images, or CDN assets.

## Getting started

Use Node.js 24 LTS and npm. The repository includes an `.nvmrc` containing `24` for environments that support it.

```sh
git clone https://github.com/AndyLamyinwik/termshift-finance-lab.git
cd termshift-finance-lab
npm ci
npm run dev
```

Open the local URL printed by Vite. Vite is configured with the base path `/termshift-finance-lab/` for the future GitHub Pages target.

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
- A responsive dark homepage with the TermShift name, product introduction, module descriptions, and a visible development status.
- React-independent Contract v1 and Scenario v1 schemas with strict runtime validation and structured errors for unknown inputs.
- Monthly fee, transaction fee, and late fee rule data types, restricted to USD cents and integer basis points.
- Three complete synthetic experiments: The Waiver Trap, The Microtransaction Penalty, and The Grace Period Shift.
- Pure TypeScript evaluation and comparison APIs with exact integer arithmetic, per-transaction half-up rounding, Gregorian calendar-day calculations, structured traces, and explicit validation/overflow failures.
- Executable homepage, runtime validation, and calculation tests, linting, type checking, and build scripts.
- Engineering documentation, an MIT license, and a GitHub Actions CI workflow.

The homepage is informational. It contains no unimplemented analysis controls or fabricated financial results.

The public data model API is exported from `src/models/index.ts`; synthetic fixtures are exported from `src/scenarios/index.ts`. Validation accepts `unknown` and returns either validated data or issues with a field path, code, and message. It checks actual Gregorian calendar dates without JavaScript date normalization, rejects unknown object fields, and bounds scenario inputs to 10,000 transactions and 1,000 payment events. Models and validators run in the Node.js test environment without React, browser APIs, a clock, random values, or network access.

The public calculation API is exported from `src/engine/index.ts`. `evaluateContract(contractInput, scenarioInput)` and `compareContracts(oldContractInput, newContractInput, scenarioInput)` accept `unknown`, use the existing runtime validators, and return `{ success: true, data }` or `{ success: false, issues }`. A comparison evaluates both contracts against the same scenario; positive deltas mean the new contract costs more and negative deltas mean it costs less. Calculation inputs are not mutated, and results contain JSON-safe integer numbers rather than `bigint`.

Contract `effectiveDate` is descriptive version metadata. It does not prevent a scenario from being used for a counterfactual comparison. Internal `bigint` arithmetic preserves monetary precision, and results outside the safe integer range fail explicitly. The completed-payment late fee is assessed separately for each synthetic payment event; it does not model real account-level bank late fees, balances, partial repayments, interest, or financial regulation.

The existing fixtures produce these calculated totals:

| Experiment | Old total (USD cents) | New total (USD cents) | New minus old (USD cents) |
| --- | ---: | ---: | ---: |
| The Waiver Trap | 0 | 1,200 | +1,200 |
| The Microtransaction Penalty | 10 | 210 | +200 |
| The Grace Period Shift | 0 | 1,500 | +1,500 |

These are computations over fictional inputs, not real product analyses or financial advice. Expected results belong in tests and documentation; fixtures retain their input data without embedded answers.

## Planned modules

| Module | Intended role |
| --- | --- |
| Financial Diff | Compare financial contract rules and explain where simulated outcomes diverge. |
| Counterexample Hunter | Search explicit scenarios for examples that expose meaningful differences between contracts. |
| Proof of Impact | Trace the rules and calculations behind a difference so its effect can be explained. |

The complete product modules and their interfaces are design targets for later stages. Stage 3 provides outcome comparison and calculation traces as foundations; it does not implement structural rule diffs, automatic counterexample discovery, or an interactive Proof of Impact view. The current model supports USD only, with amounts stored as integer cents. Future currency support must declare each currency's unit scale instead of assuming all currencies have two decimal places.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for frontend constraints and module boundaries, [docs/FINANCIAL_MODEL.md](docs/FINANCIAL_MODEL.md) for input fields and validation requirements, and [docs/CALCULATION_ENGINE.md](docs/CALCULATION_ENGINE.md) for formulas, result structures, trace fields, errors, and worked synthetic experiments.

## License

TermShift is released under the [MIT License](LICENSE).
