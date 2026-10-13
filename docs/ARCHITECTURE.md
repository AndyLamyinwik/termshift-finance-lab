# Architecture

## Stage 1 scope

TermShift starts as a single React application written in strict TypeScript and built with Vite. Stage 1 establishes the application shell, a responsive informational homepage, development tooling, a basic test, documentation, and continuous integration.

The Financial Diff, Counterexample Hunter, and Proof of Impact modules are described on the homepage but are not implemented. Stage 1 does not simulate contracts, calculate financial outcomes, or display sample analysis results.

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

## Planned rules engine boundaries

The following boundaries describe future design work. They do not require implementation, placeholder files, or new dependencies in Stage 1.

| Boundary | Responsibility |
| --- | --- |
| Types | Define contracts, supported rules, scenarios, monetary values, outcomes, and calculation traces. |
| Validation | Check input shape, supported rule combinations, currencies, numerical ranges, and scenario constraints before calculation. |
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

Future financial calculations will represent amounts as integers in the currency's minimum unit. The scale belongs to the currency definition; it must not assume that every currency has two decimal places.

If JavaScript `number` values are used, validation must enforce `Number.isSafeInteger` for monetary inputs and checked arithmetic must reject results outside the safe integer range. A later design may select `bigint` where required, with an explicit serialization strategy. Stage 1 does not choose or implement a financial arithmetic library.

Rates, fractions, division, and conversions require an explicit representation and rounding policy. Each rule must specify when rounding happens and which mode applies. Formatting amounts for display must not alter the values used by the engine. Binary floating-point decimal arithmetic must not silently determine monetary outcomes.

## Quality checks

The local development baseline is Node.js 24 LTS and npm. TypeScript strict mode, ESLint, and Vitest provide separate checks for type correctness, code quality, and executable behavior.

GitHub Actions runs `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` on pushes and pull requests. A committed `package-lock.json` supports reproducible dependency installation. Secrets, dependency directories, and build artifacts must not be committed.

## Future deployment target

The intended hosting target is GitHub Pages for the public `termshift-finance-lab` repository. Vite's base path is configured as `/termshift-finance-lab/` so generated asset URLs support that repository path.

Stage 1 provides CI only. GitHub Pages publishing, deployment permissions, and release automation belong to a later stage.
