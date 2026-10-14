# Proof of Impact Viewer

Stage 5C-1 connects the existing Stage 4B Proof of Impact API to the shared React workspace. Stage 5C-2 adds full JSON and readable Markdown downloads plus independent verification of local saved proofs. The viewer uses the existing schema, creator, verifier, report formatter, and financial APIs throughout.

## Generate and inspect a proof

1. Start the application with `npm ci` and `npm run dev`, and open Vite's `/termshift-finance-lab/` URL.
2. Open **Counterexample Hunter**, choose a synthetic experiment, set valid search options, and choose **Run Search**.
3. Select a retained nonzero-delta witness. The first retained witness is selected after a successful search that finds witnesses.
4. Open **Proof of Impact** using the native sidebar navigation. Review the selected candidate, source, seed, and saved contract context.
5. Enter **Max Checks**, default `200`, and choose **Generate Proof**. This explicit action calls the unchanged creator and then independently verifies its returned proof.
6. Inspect Verification Overview, Original Witness versus Minimized Witness, accepted Reduction Timeline, financial explanation, and limitations.
7. Choose **Verify Again** to recheck the saved proof, or **Clear Proof** to clear evidence without changing the search or budget draft.

Generation takes place in **Current Workspace Proof**. All four views share the selected experiment and applied workspace. The page remains available before search, but generation requires a valid selected witness. Its empty state says:

> No witness selected. Run a counterexample search and select a witness first.

The **Go to Counterexample Hunter** control navigates back to the operational search view. Navigation, budget entry, generation, verification, clearing, details controls, and Show More are native keyboard-operable controls with visible focus. The desktop comparison uses side-by-side panels and stacks on small screens.

## Portable Evidence Actions

**Evidence Actions** selects either **Current Workspace Proof** or **Imported Proof**. Only the selected source's verified proof enables **Download JSON** and **Download Markdown**. JSON download freshly calls `verifyImpactProof` and preserves the complete version-1 proof; Markdown download calls the existing `formatImpactReport` and uses its verified financial report. Failures expose formal structured issues and do not dispatch a download. The native filenames are `termshift-impact-proof.json` and `termshift-impact-report.md`.

**Import Proof JSON** uses a native local file picker. Import needs no selected Hunter witness. The file must be at most 5 MiB, decode as strict UTF-8, parse as JSON, satisfy the official ImpactProofSchema, and pass independent `verifyImpactProof`. The picker hint does not make filenames or MIME types trusted. Import automatically opens Imported Evidence and displays its own contracts and witness metadata, without assigning the current experiment's name.

> Imported proof verified independently against its embedded contracts.

The same Overview, Before/After Comparison, Reduction Timeline, Financial Explanation, and Limitations components display the selected proof source. Only one evidence body is mounted at a time. **Verify Imported Proof Again** recomputes the saved imported evidence; **Clear Imported Proof** clears imported evidence and pending reads without deleting current Workspace Proof. Import failure clears the previous imported Verified state and financial success panels while preserving current workspace data. Current Apply, Reset, experiment changes, or search invalidations do not rewrite independently imported contracts.

JSON can be independently reverified; Markdown is convenient to read and does not replace the complete JSON. Neither file has a digital signature or authenticated authorship. The 5 MiB file limit is separate from financial safe-integer limits. No upload, remote resource, browser persistence, HTML/Markdown execution, or PDF pipeline is involved. See [PORTABLE_EVIDENCE.md](PORTABLE_EVIDENCE.md) for the full validation and isolation contract.

## Witness and SearchSnapshot

The current successful `SearchSnapshot` contains detached old/new applied contracts, the validated neutral base Scenario, numeric search options, complete SearchReport, and selected witness ID. Generation resolves this ID inside that report's retained witnesses and uses exactly those contracts, witness, and numeric options:

```ts
createImpactProof(
  snapshot.oldContract,
  snapshot.newContract,
  selectedWitness,
  snapshot.searchOptions,
  validatedMinimizationOptions,
)
```

Proof input does not come from Financial Diff's raw text or a previous search context. Pending Financial Diff edits produce a visible reminder and do not change saved evidence until valid Apply. Generation and verification do not mutate fixtures or the original search result. The Dashboard Scenario and Hunter's independent Search Starting Scenario keep their existing meanings; proof reduction starts from the actual selected witness.

All settings, contracts, reports, and current/imported proof state exist only in the current page's React memory. There is no LocalStorage, SessionStorage, IndexedDB, remote storage, account, or URL persistence. Reload restores the original Waiver Trap Dashboard and clears previous results. A downloaded local file remains available under the user's control and can be explicitly imported again.

## Minimization budget and limits

**Max Checks** is required canonical integer text from `1` through `300`. Its default `200` comes from the official `MinimizationOptionsSchema`. The draft validator uses the existing exact integer parser, then that unchanged schema. It rejects blank values, whitespace, signs, leading zeros, fractions, scientific notation, non-finite tokens, overlong text, missing/non-string fields, and unknown keys without trimming, rounding, coercion, or clamping. Errors retain a field path, code, and message and prevent the creator call.

The budget counts the minimizer's actual financial comparison calls, including verification of the original witness and failed candidate comparisons. It is separate from search's evaluation budget and the later verifier's `verifiedComparisons`. With Max Checks `1`, only the original comparison fits; the returned best valid witness may be unchanged and budget-exhausted. Exhaustion is a valid bounded result, not a failed or globally completed proof.

The minimizer reduces the lexicographic objective of purchase count, purchase total cents, and total nonnegative late days. It can delete purchases, lower retained integer purchase amounts, or move late paid dates toward their due dates, within the saved search bounds. It preserves scenario identity, billing month, retained transaction order and identifiers, and all payment obligation IDs, due dates, amounts, and order. It does not create or remove payment obligations.

Every accepted change retains a nonzero cost difference with the original sign. The absolute delta can become smaller: a positive $2.00 transaction-fee difference can become positive $0.20. A negative difference must remain negative. The minimized witness may have nonuniform purchase amounts or separate payment delays even though Stage 4A's generated family uses uniform amounts and shared delay.

`strategy-complete` means the defined deterministic probes found no further improvement within their strategy and bounds. It does not prove a global minimum. `budget-exhausted` means the selected comparison budget stopped reduction, with the best valid result available at that point. Neither upgrades SearchReport coverage into full scenario coverage or general contract equivalence.

## Generation and verification state

The existing workspace's `proofState` explicitly distinguishes idle, success, and failure. Success retains the complete ImpactProof and the actual successful verification payload. Failure identifies creation versus verification, retains original structured issues, and can retain a created proof for Verify Again when verification fails.

| Visible verification status | Meaning |
| --- | --- |
| Not generated | No currently verified proof exists; generation has not succeeded, was cleared, became invalid, or failed before a proof was created. |
| Verification failed | A saved created proof failed `verifyImpactProof`; its structured issues are displayed without a Verified label or successful financial panels. |
| Verified | The current saved proof passed the actual Stage 4B verifier under the current engine and constraints. |

Generate Proof calls `createImpactProof` only on that user action. If creation succeeds, it immediately calls `verifyImpactProof` on the returned evidence. Creation success alone does not authorize a Verified status. Creation and verification failures display original code, path, and message rather than invented zero-cost values.

Verify Again calls `verifyImpactProof` on the current saved proof. It does not create a new proof, search again, or rerun minimization. A failed retry removes success status and can be retried against that saved evidence. Clear Proof clears both proof and verification while preserving the budget draft. The synchronous pure APIs run locally; there is no simulated network loading, cancel button, Web Worker, or backend task.

The verifier validates schemas, scenarios, and reduction constraints and recomputes recorded comparisons with the existing calculation engine. `verifiedComparisons` is the actual count of financial comparisons during verification: the original endpoint, minimized endpoint, and each accepted reduction step. It is not the minimizer check count or the original search evaluation count.

Verified describes internal calculation and constraint consistency. It does not provide a digital signature, authenticated historical search execution, a tamper-proof guarantee, or regulatory certification. Changing a recorded fee without consistent recalculation fails verification, but someone can construct different internally consistent fictional evidence; no external provenance authority is present.

## Original versus minimized evidence

Verification Overview displays actual proof schema, engine/minimizer versions, old/new contract IDs, candidate ID and source, search seed, original/reduced delta, checks performed, max checks, budget exhaustion, termination reason, and the successful verification's comparison count. These values come from ImpactProof and the verifier, rather than predefined answers for the experiments.

The Original Witness and Minimized Witness panels each display actual purchase count/total, payment count/delay summary, old/new costs, and signed new-minus-old delta. Counts and totals come from each scenario's transaction array, including nonuniform amounts. Payment dates and calendar-day delays come from actual payment records and the existing Gregorian calendar tools, including early and cross-month payments. Zero purchases and zero payment events have explicit readable states. All money reuses the existing exact USD cents formatter; the UI introduces no fee arithmetic.

Financial Explanation renders the saved minimized Comparison's actual calculation traces and proof calculation policy. The limitations come from the saved proof's limitations field. Stage 2–4B schemas, formulas, search logic, proof APIs, and formal fixtures remain unchanged.

## Accepted Reduction Timeline

The timeline renders only `ImpactProof.reductionSteps`, which records accepted changes. Each visible step shows its number, type, reason, before/after purchase counts and totals, before/after payment delays, before/after signed delta, and the accepted old/new comparison. Rejected probes are not invented as steps or presented as accepted reductions.

When the array is empty, the page says:

> No accepted reduction steps under the selected strategy and budget.

This can occur for a witness already irreducible under the finite strategy or a budget that permits no candidate check. It does not establish global minimality.

Initially only the first ten steps are mounted. **Show More** exposes the next ten, with a visible count of shown versus total steps. Compact step summaries avoid mounting every step's full transaction array or trace; financial trace details are reserved for the minimized endpoint. Even a maximum-budget proof therefore starts with a bounded DOM rather than all potential 299 accepted changes at once.

## Invalidation and reset

| Action | Proof behavior |
| --- | --- |
| Choose a different witness in Hunter | Clear old proof and verification; preserve the search report and budget draft. |
| Run Search again, including an invalid or failed attempt | Clear old proof while validating/running the new search context. |
| Edit search seed, ranges, budgets, or result limit | Clear report, selection, proof, and verification immediately. |
| Edit Max Checks | Clear prior proof and verification; generate explicitly under the new valid budget. |
| Apply valid Financial Diff changes | Clear search snapshot and proof; retain controls for explicit reruns. |
| Reset to Original | Restore original contracts, default search settings, and Max Checks 200; clear result, selection, proof, and errors. |
| Select a different experiment | Initialize its originals and all defaults; clear prior evidence. |
| Pending Financial Diff text or invalid Apply | Preserve proof because the saved applied-contract snapshot remains current. |
| Switch views, select the same experiment, or reselect the same witness | Preserve still-valid proof and verification. |
| Clear Proof | Clear proof and verification only; retain current search context and budget draft. |

This table applies to Current Workspace Proof. Imported Evidence is isolated from those calculation inputs and remains unchanged by Apply, Reset, experiment/witness changes, search controls, or current proof generation/clearing. An invalidated current proof cannot retain a Verified label. Users must rerun the required search and/or Generate Proof action for the current inputs. A page switch alone is not an input change and does not discard either evidence source.

## Reproduce the three experiments

Use original contracts and Hunter defaults: seed `20260401`, 120 evaluations, five retained witnesses, purchase count 0–10, purchase amount USD 1.00–10.00, and late days 0–5. Search from Hunter's empty-purchase/on-time base, retain its initially selected candidate, and generate with Max Checks `200`. The following are actual Stage 4A/4B results under those inputs:

| Experiment / candidate | Original purchases / total | Minimized purchases / total | Old / New costs before | Old / New costs after | Delta before → after |
| --- | --- | --- | --- | --- | --- |
| The Waiver Trap / `boundary-3` | 5 / $5.00 | 5 / $5.00 | $0.00 / $12.00 | $0.00 / $12.00 | +$12.00 → +$12.00 |
| The Microtransaction Penalty / `boundary-1` | 10 / $14.90 | 1 / $1.00 | $0.10 / $2.10 | $0.01 / $0.21 | +$2.00 → +$0.20 |
| The Grace Period Shift / `boundary-1` | 10 / $10.00 | 0 / $0.00 | $0.00 / $15.00 | $0.00 / $15.00 | +$15.00 → +$15.00 |

| Experiment | Checks / Max Checks | Accepted steps | Termination | Budget Exhausted | Verification / comparisons |
| --- | --- | ---: | --- | --- | --- |
| The Waiver Trap | 9 / 200 | 0 | `strategy-complete` | false | Verified / 2 |
| The Microtransaction Penalty | 6 / 200 | 4 | `strategy-complete` | false | Verified / 6 |
| The Grace Period Shift | 4 / 200 | 1 | `strategy-complete` | false | Verified / 3 |

Waiver Trap retains all five $1 purchases: reducing to four would make the old contract charge its monthly fee too and remove the nonzero difference. Microtransaction Penalty deletes nine purchases and reduces the retained amount from $1.49 to $1.00. Its reduced delta remains positive despite a smaller absolute amount. Grace Period Shift removes all unrelated purchases but preserves `grace-payment-1`, due `2026-05-15`, paid `2026-05-17`, amount $100.00, and its necessary two-day delay. Shortening that delay to one day would remove the late-fee difference.

These are reproducible calculations over synthetic inputs, not values embedded in the interface or fixtures. Different selected witnesses, applied contracts, search bounds, or budgets can produce different valid reductions.

## Current scope and checks

Stages 5C-1 and 5C-2 are entirely local, with no AI/LLM, runtime network request, banking API, backend, database, login, tracking, cloud storage, or remote assets. They add no dependency. Stage 5C-2 provides native complete JSON/official Markdown downloads and strict independent local JSON import. PDF generation, Release creation, GitHub Pages deployment, and later stages remain outside its scope; existing CI verifies pushes and pull requests only.

Stage 5C-1's budget and viewer tests cover canonical parsing, real searched-witness creation/verification, positive/negative deltas, direction preservation, bounded timeline expansion, budget exhaustion, current invalidation, draft/view persistence, verification retries, structured errors, forged values, immutable inputs, and no external calls. Stage 5C-2 preserves all 1,039 prior tests and adds real File/Blob/React DOM coverage for round trips, independent import, tamper/size/UTF-8/JSON rejection, races, clear/retry behavior, workspace isolation, native download cleanup, safe text, accessibility, and no runtime network or browser storage. Responsive browser validation targets 320, 390, 768, and 1440px.

Run the existing CI sequence locally:

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

See [COUNTEREXAMPLE_UI.md](COUNTEREXAMPLE_UI.md) for search controls and coverage, [PORTABLE_EVIDENCE.md](PORTABLE_EVIDENCE.md) for local files and independent evidence, [MINIMIZATION_AND_PROOF.md](MINIMIZATION_AND_PROOF.md) for core evidence contracts, and [ARCHITECTURE.md](ARCHITECTURE.md) for workspace/module boundaries.
