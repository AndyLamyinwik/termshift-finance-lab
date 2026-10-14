# TermShift

**Financial Contract Counterexample Lab · v1.0.0**

[![CI](https://github.com/AndyLamyinwik/termshift-finance-lab/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/AndyLamyinwik/termshift-finance-lab/actions/workflows/ci.yml)

[Live Demo](https://andylamyinwik.github.io/termshift-finance-lab/) · [Releases](https://github.com/AndyLamyinwik/termshift-finance-lab/releases) · [Changelog](CHANGELOG.md)

TermShift is an explainable financial contract simulation and counterexample discovery engine. Compare two fictional contracts, find a scenario where their fees differ, reduce that scenario, and inspect independently recalculated evidence of its impact.

All financial calculations run locally in your browser. TermShift is a static frontend with no account connection, backend, database, runtime external API, or AI service.

## Explore the lab

| Module | What you can do |
| --- | --- |
| **Dashboard** | Select a synthetic experiment and inspect old/new totals, signed differences, rule-level fees, and calculation traces. |
| **Financial Diff** | Edit existing monthly, transaction, and late-fee rules on separate working contracts. Apply validated changes or reset the originals. |
| **Counterexample Hunter** | Run deterministic, bounded searches with explicit ranges, seed, and evaluation budget. Inspect search statistics and select real witnesses calculated by the engine. |
| **Proof of Impact** | Reduce a selected witness, verify its original/reduced evidence, inspect accepted steps, and download or independently import portable evidence. |

Start with **The Waiver Trap** in the Dashboard. In **Financial Diff**, change the new monthly purchase-total waiver from $500 to $50 and choose **Apply Changes**: the fixed experiment's difference becomes $0.00. Change it to $60: the difference becomes +$12.00. **Reset to Original** restores the fixture contracts and default controls.

Choose **Run Search** in **Counterexample Hunter**, select a witness, then open **Proof of Impact** and choose **Generate Proof**. **Verify Again** independently checks saved evidence without rerunning the search or minimizer. Changing applied contracts, search settings, or the selected witness clears dependent workspace results; invalid drafts and view navigation preserve still-valid results.

## Three synthetic experiments

These totals are computed from the included fixtures. Positive differences mean the new contract costs more.

| Experiment | Contract change | Fixed scenario | Old fee | New fee | Difference |
| --- | --- | --- | ---: | ---: | ---: |
| **The Waiver Trap** | A $12 monthly fee changes its waiver from at least five purchases to at least $500 in purchases. | Five purchases of $10 each. | $0.00 | $12.00 | **+$12.00** |
| **The Microtransaction Penalty** | A 100-bps fee changes to 60 bps plus $0.20 per purchase. | Ten purchases of $1 each. | $0.10 | $2.10 | **+$2.00** |
| **The Grace Period Shift** | A $15 late fee changes its grace period from three days to one. | Payment due May 15, 2026, completed May 17. | $0.00 | $15.00 | **+$15.00** |

The contracts, transactions, and payment events are fictional. They are examples of this model's behavior and do not describe a real bank product or provide financial advice.

## Run locally

Use **Node.js 24 LTS** and npm. The Node version is recorded in `.nvmrc`; dependencies are pinned in `package-lock.json`.

```sh
git clone https://github.com/AndyLamyinwik/termshift-finance-lab.git
cd termshift-finance-lab
npm ci
npm run dev
```

Open the URL printed by Vite, normally `http://localhost:5173/termshift-finance-lab/`.

| Command | Purpose |
| --- | --- |
| `npm ci` | Install the exact locked dependencies. |
| `npm run dev` | Start the local development server. |
| `npm run lint` | Run ESLint. |
| `npm run typecheck` | Check strict TypeScript types without emitting files. |
| `npm test` | Run the Vitest suite once. |
| `npm run build` | Create the static production build in `dist/`. |

Before submitting a change, run all five verification commands:

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

GitHub Actions runs the same checks on pushes and pull requests. The separate Pages workflow verifies main pushes before deployment; pull requests do not publish. See [Contributing](CONTRIBUTING.md).

## Architecture

TermShift uses **React, TypeScript strict mode, Vite, Zod, Vitest, ESLint, and GitHub Actions** in one frontend project. The financial core is independent of React and the browser and runs in Node.js tests.

| Boundary | Responsibility |
| --- | --- |
| [`src/models/`](src/models/) | Strict Contract v1 and Scenario v1 schemas, Gregorian date validation, and structured input errors. |
| [`src/engine/`](src/engine/) | Exact fee evaluation, contract comparison, and calculation traces. |
| [`src/search/`](src/search/) | Deterministic candidate generation and bounded counterexample search. |
| [`src/minimizer/`](src/minimizer/) | Budgeted witness reduction that preserves a nonzero difference and its direction. |
| [`src/proof/`](src/proof/) | Proof Schema v1, independent recalculation, and Markdown report formatting. |
| [`src/scenarios/`](src/scenarios/) | Three formal synthetic experiment inputs. |
| [`src/features/`](src/features/) | Views, exact input/amount presentation, local file handling, and shared in-memory workspace state. |

Public core APIs accept `unknown` inputs and return either validated results or structured issues with code, field path, and message. Unknown fields, invalid dates, unsafe amounts, and unsupported versions are rejected. Calculation errors are displayed as errors rather than converted to zero fees. See [Architecture](docs/ARCHITECTURE.md) and [Financial Model](docs/FINANCIAL_MODEL.md).

## Financial precision

- The model supports **USD only**, represented as safe integer cents. Future currencies would require explicit unit scales; two decimal places are not assumed for every currency.
- Rates use integer **basis points**: 1 bps = 0.01%, and 10,000 bps = 100%.
- Internal `bigint` arithmetic preserves exact monetary results. Each purchase's proportional fee is rounded half-up to cents before adding its fixed fee; totals outside the safe integer range fail explicitly.
- Dates are strict Gregorian calendar dates. Late days use calendar-day comparisons, including leap years and cross-month payments; early payment has zero late days.
- A late fee applies separately to each completed synthetic payment event when its delay exceeds the grace period.
- `effectiveDate` is descriptive contract-version metadata and does not reject counterfactual scenarios.

See [Calculation Engine](docs/CALCULATION_ENGINE.md) for formulas, policies, and traces, and [Financial Diff](docs/FINANCIAL_DIFF.md) for exact input validation.

## Counterexample search and reduction

Search starts from an explicit scenario and applied contracts. The interface creates a neutral starting scenario with no purchases and the experiment's existing payment obligations paid on their due dates. Only **Run Search** performs a search.

The generated family uses equal-sized purchases and one shared payment delay. Search prioritizes rule boundaries and then uses exploration driven by an explicit seed. With the same complete inputs, seed, options, and code revision, candidate order and results are reproducible.

Search allows at most **30 purchases, five payment events, 500 evaluations, and ten retained witnesses**. Generated purchase amounts are bounded to 1–100,000 cents and delays to 0–31 days. Reports disclose actual evaluations, failures, skips, retained witnesses, stopping reason, and generated-family coverage.

No witness means no difference was found within the selected range and budget. A strongest observed witness is not a global maximum. Complete generated-family coverage does not establish general contract equivalence or successful financial evaluation of every candidate.

The minimizer reduces purchase count, purchase total, and nonnegative payment delay under the original bounds while preserving payment obligations and a nonzero delta with the same sign. It uses a deterministic finite strategy with **200 checks by default and a hard maximum of 300**. A reduced witness is not guaranteed to be globally minimal.

See [Search API](docs/COUNTEREXAMPLE_SEARCH.md), [Hunter Interface](docs/COUNTEREXAMPLE_UI.md), and [Minimization and Proof](docs/MINIMIZATION_AND_PROOF.md).

## Portable evidence

In **Proof of Impact → Evidence Actions**, choose **Current Workspace Proof** or **Imported Proof**.

- **Download JSON** saves the complete contracts, options, scenarios, comparisons, reduction steps, policies, and limitations as `termshift-impact-proof.json`.
- **Download Markdown** saves a human-readable, verified report as `termshift-impact-report.md`. Markdown is a report, not a replacement for complete JSON evidence.
- **Import Proof JSON** reads a local UTF-8 file with a **5 MiB limit**, validates the strict proof schema, and independently recomputes its recorded financial evidence against the embedded contracts.
- **Verify Imported Proof Again** repeats verification. **Clear Imported Proof** clears only imported state.

Imports do not replace working contracts, search results, or the current workspace proof. Imported evidence remains separate when working contracts or the experiment change. Download actions perform fresh official verification and are enabled only for verified evidence.

Verification checks schema compatibility, arithmetic, traces, reduction invariants, and accepted step continuity. A changed recorded fee or delta that disagrees with recalculation is rejected. **Verified** means calculation consistency; it does not authenticate the author, establish the inputs' real-world truth, certify historical search activity, or provide a digital signature. Consistently rewritten evidence can constitute a different internally consistent submission.

See [Proof Viewer](docs/PROOF_VIEWER_UI.md) and [Portable Evidence](docs/PORTABLE_EVIDENCE.md).

## Security and privacy

Financial calculations and imported files stay in local page memory. The application does not upload JSON, connect to bank accounts, call AI or financial APIs, include external trackers, or save financial data to browser permanent storage. Reloading discards workspace and imported evidence; explicit downloads save local files.

Imports are inert data: file size is checked before reading and again against actual bytes, invalid UTF-8/JSON is rejected, and imported strings are rendered as text without executing HTML, Markdown, or JavaScript. There is no runtime remote font, image, or CDN dependency. Normal public-site requests load static resources from GitHub Pages; development dependency installation and GitHub Actions use network access.

## Deployment

[GitHub Pages](https://andylamyinwik.github.io/termshift-finance-lab/) serves the static build under `/termshift-finance-lab/`. The Vite base path and local favicon support that project path. The deployed [`build-info.json`](https://andylamyinwik.github.io/termshift-finance-lab/build-info.json) records the exact source commit in its `commit` field; the application does not fetch this metadata during use.

The Pages workflow uses pinned official Actions and the `github-pages` environment with scoped Pages/OIDC deployment permissions. See [Deployment](docs/DEPLOYMENT.md) for verification and troubleshooting.

## Known limitations

- Only USD and the three supported fee-rule categories are modeled; contracts and experiments are synthetic.
- No real bank accounts, balances, pending payments, partial repayments, minimum repayments, full credit-card interest, or compound interest are supported.
- The interface edits existing rule parameters. It does not add/remove rule categories, edit scenarios or general contract metadata, or import/export standalone contracts.
- Search explores a restricted generated family within finite ranges and budgets. Search results are not general contract-equivalence proofs; minimization does not guarantee a global minimum.
- Proof verification is unsigned consistency checking, not authenticated provenance, regulatory certification, or proof that a historical search was run.
- TermShift does not provide financial advice. Real contract interpretation and account-level banking behavior may differ from this model.

## Contribute

Bug reports and focused pull requests are welcome. Include reproducible inputs and the expected versus observed behavior, and preserve exact monetary arithmetic, truthful error reporting, and local-only operation. See [CONTRIBUTING.md](CONTRIBUTING.md) for the development checks and review expectations.

## License

TermShift is available under the [MIT License](LICENSE).
