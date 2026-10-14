# Changelog

## v1.0.0 — 2026-10-15

TermShift's first complete Financial Contract Counterexample Lab combines local contract comparison, bounded counterexample discovery, and independently verifiable calculation evidence.

### Added

- **Financial Contract Schema:** Strict Contract v1 and Scenario v1 runtime validation for USD contracts, calendar-month purchases, and completed payments. Monthly, transaction, and late-fee rules use integer cents, integer basis points, and Gregorian calendar dates.
- **Deterministic Calculation Engine:** React-independent TypeScript evaluation and comparison with exact internal integer arithmetic, per-purchase half-up rounding, calendar-day late fees, structured traces, and explicit validation or overflow failures.
- **Counterexample Hunter:** Reproducible seeded search with declared ranges, finite evaluation budgets, selectable computed witnesses, and honest evaluation, skip, failure, and coverage statistics.
- **Minimization Engine:** Deterministic bounded reductions of purchase counts, amounts, and payment delays that preserve payment obligations and a nonzero fee difference with its original sign.
- **Proof of Impact:** Complete original and reduced scenarios, embedded contracts, computed comparisons, accepted reduction steps, and independent verification through fresh engine evaluations.
- **Portable JSON Evidence:** Verified JSON downloads, readable Markdown reports, and local UTF-8 JSON import up to 5 MiB. Imported evidence is verified against its embedded contracts without overwriting the current workspace.
- **Interactive Dashboard:** Engine-derived summaries, category comparisons, and calculation traces for The Waiver Trap, The Microtransaction Penalty, and The Grace Period Shift.
- **Financial Diff:** Validated old/new contract editing with Apply and Reset, exact monetary input parsing, field errors, and invalidation of stale search and proof results.
- **GitHub Pages Deployment:** Static project-path hosting, commit-identifying `build-info.json`, and separate CI and Pages workflows that verify the source before publication.
- Responsive views, labeled form controls, visible keyboard focus, and local visual assets without remote fonts, CDNs, or analytics.

### Quality and privacy

- Automated coverage includes runtime schemas, exact calculations, search, minimization, proof tampering, JSON round trips, file bounds, workspace interactions, and import isolation.
- Financial calculations and evidence handling run locally. There is no backend, account connection, financial API, AI/LLM integration, file upload, or permanent browser storage.
- The public site was exercised in a real browser across the four core views and portable evidence flows at 320, 390, 768, and 1440px.

### Known limitations

- Contract v1 supports **USD only**. Amounts are USD cents; this does not assume that future currencies have two decimal places.
- The included contracts and experiments are fictional. TermShift does not connect to real banks or support real bank accounts.
- The model covers monthly fees, per-purchase transaction fees, and independent fees for completed payment events. It does not model unpaid or partial repayments, balances, minimum payments, a full credit-card interest model, or compounding.
- Search is bounded to 30 purchases, five payment events, 500 comparisons, and ten retained witnesses. Its generated family uses uniform purchase amounts and a shared payment delay; it does not cover every possible scenario.
- Minimization uses a finite strategy and at most 300 comparisons. A reduced witness is not a proven global minimum; no-witness search results do not prove general contract equivalence.
- **Proof Verified** establishes calculation and reduction consistency under the supported model. It does not authenticate the source, sign the evidence, or certify historical search execution.
- Imported JSON is limited to 5 MiB. Markdown is a readable report, not a replacement for complete JSON evidence.
- Workspace and imported evidence live in page memory and disappear on reload. Saving a file requires an explicit download.
- TermShift is research software and does not constitute financial advice or regulatory approval.

Available under the [MIT License](LICENSE).
