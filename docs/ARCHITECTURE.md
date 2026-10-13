# Architecture

## Implemented scope

TermShift starts as a single React application written in strict TypeScript and built with Vite. Stage 1 establishes the application shell, a responsive informational homepage, development tooling, a basic test, documentation, and continuous integration.

Stage 2 adds Contract v1 and Scenario v1 data models, financial rule types, Zod runtime validation, three synthetic experiment fixtures, and executable validation tests. It preserves the homepage and existing engineering configuration. The data model is independent of React and can be imported in a Node.js test environment.

The Financial Diff, Counterexample Hunter, and Proof of Impact modules are described on the homepage but are not implemented. The application does not simulate contracts, calculate financial outcomes, compare rules, search for counterexamples, or display sample analysis results. Stage 2 does not add a financial engine or new UI.

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

All nested model objects reject unknown fields. Validation performs no implicit conversion or date repair. Calendar fields use Gregorian year, month, and day arithmetic, with years from 0001 through 9999, instead of JavaScript `Date` normalization. Later engines must compare calendar days rather than timestamps or local-time instants. Contract `effectiveDate` describes its version and is not an eligibility check against a scenario; counterfactual experiments may pair a contract with an earlier scenario.

Scenario input limits are 10,000 transactions and 1,000 payment events. Empty arrays are valid. Inputs exceeding these limits are rejected before their elements are parsed. IDs are unique within each collection; an ID can appear once in each collection because transaction and payment IDs occupy separate namespaces.

`validateContract(unknown)` and `validateScenario(unknown)` return either `{ success: true, data }` or `{ success: false, issues }`. Each issue has a path of string or number segments, a code, and a readable message. Validation does not depend on the clock, timezone, randomness, or network and produces the same result for the same input.

`src/scenarios/` holds explicit, synthetic data for the three named experiments. Fixtures contain an old contract, a new contract, a scenario, and descriptive text. They contain no computed fee totals, comparisons, winners, or impact results. Their data is validated by the same public validators available to future consumers.

The detailed contract is documented in [FINANCIAL_MODEL.md](FINANCIAL_MODEL.md).

## Planned rules engine boundaries

The types, input validation, and fixed synthetic scenarios are implemented in Stage 2. The remaining boundaries describe future work and do not require placeholder engines, a plugin system, or extra dependencies now.

| Boundary | Responsibility |
| --- | --- |
| Types | Define contracts, supported rules, scenarios, and monetary values; later add outcomes and calculation traces. |
| Validation | Check input shape, supported rules, currencies, numerical ranges, and scenario constraints before calculation. |
| Money | Handle integer minimum currency units, checked arithmetic, rate representations, and explicit rounding policies. |
| Engine | Evaluate a validated contract against an explicit scenario and return its outcome and trace. |
| Scenarios | Represent and generate bounded, reproducible input scenarios for evaluation. |
| Diff | Compare outcomes and traces from two contracts evaluated against the same scenario. |
| Counterexamples | Search a declared scenario space for inputs that satisfy a stated difference predicate. |
| Explanations | Turn calculation traces and comparisons into evidence for Proof of Impact. |

The rules engine should be independent of React and browser presentation. Its core functions should be pure and deterministic: the same validated contract, scenario, and calculation policy must yield the same result. Inputs such as evaluation dates and search parameters should be explicit rather than read implicitly from the system clock or an external service.

Presentation components will collect inputs and render validated results. They should not contain financial rule logic. The engine should return structured traces that preserve the rules and intermediate values used in a calculation; the explanation layer should describe that evidence without inventing unsupported conclusions.

Counterexample searches should report their scenario bounds and completion status. A search that finds no counterexample within its declared scope does not establish equivalence outside that scope.

## Monetary representation

Contract v1 supports only USD. Amount fields ending in `Cents` store USD cents as JavaScript safe integers; one USD is 100 cents. A fee may be zero, while transaction amounts, completed payment amounts, and purchase-total waiver thresholds must be positive. Transaction-count thresholds are positive safe integer counts, and grace periods are nonnegative safe integer calendar days. Transaction fee rates are integer basis points from 0 through 10,000; one basis point is 0.01 percent.

Future currency support must represent amounts in each currency's minimum unit. The scale belongs to the currency definition; it must not assume that every currency has two decimal places. USD's current cents representation is an explicit v1 restriction, not a general currency model.

Validation enforces safe integer input ranges and rejects decimals, `NaN`, `Infinity`, and out-of-range numbers. Stage 2 does not implement monetary arithmetic or publish calculation results. A later engine must use checked arithmetic to reject results outside the safe integer range even when each individual input is valid. A later design may select `bigint` where required, with an explicit serialization strategy.

Rates, fractions, division, and conversions require an explicit representation and rounding policy. Each rule must specify when rounding happens and which mode applies. Formatting amounts for display must not alter the values used by the engine. Binary floating-point decimal arithmetic must not silently determine monetary outcomes.

## Quality checks

The local development baseline is Node.js 24 LTS and npm. TypeScript strict mode, ESLint, and Vitest provide separate checks for type correctness, code quality, and executable behavior.

Zod is the only runtime dependency added for Stage 2. Runtime tests verify the real validators, including fixtures, invalid amounts, calendar edge cases, rule structures, strict keys, array bounds, duplicate IDs, early and cross-month payments, JSON round trips, and determinism.

GitHub Actions runs `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` on pushes and pull requests. A committed `package-lock.json` supports reproducible dependency installation. Secrets, dependency directories, and build artifacts must not be committed.

## Future deployment target

The intended hosting target is GitHub Pages for the public `termshift-finance-lab` repository. Vite's base path is configured as `/termshift-finance-lab/` so generated asset URLs support that repository path.

The HTML favicon uses Vite's `%BASE_URL%` placeholder so its production URL includes that base path. The repository provides CI only. GitHub Pages publishing, deployment permissions, and release automation belong to a later stage.
