# Counterexample Hunter

Stage 5B-2 adds a local search interface for the three synthetic experiments. It uses the Financial Diff workspace's applied contracts and calls Stage 4A `searchCounterexamples` directly. Witness costs, category differences, and calculation traces come from the returned Stage 3 `Comparison`; the interface contains no fee formulas or replacement search algorithm.

## Start a search

1. Run `npm ci` and `npm run dev`, then open Vite's local `/termshift-finance-lab/` URL.
2. Choose **Counterexample Hunter** in the sidebar. Dashboard, Financial Diff, and Hunter share the selected experiment and applied contracts.
3. Choose an **Experiment** and inspect the current contract context and **Search Starting Scenario**. Selecting a different experiment restores its original terms and the default search settings, and discards prior drafts and search results.
4. Review the seed, comparison budget, result limit, and inclusive count/amount/delay ranges. The defaults below are ready to use.
5. Choose **Run Search**. The synchronous pure function executes in this browser, only on this explicit action.
6. Inspect the search summary, then select a retained witness to inspect its scenario, financial impact, calculation traces, and reproduction evidence.
7. To reduce the selected witness, open **Proof of Impact**, choose a valid Max Checks budget, and explicitly **Generate Proof**. Stage 5C-1 verifies the returned evidence before showing Verified. See [PROOF_VIEWER_UI.md](PROOF_VIEWER_UI.md).

If you want to change contract rules, open **Financial Diff**, edit existing fields, and choose **Apply Changes** before searching. Hunter visibly identifies modified applied terms. When Financial Diff has pending edits, Hunter explains that search uses the last applied contracts. Incomplete text and invalid drafts never enter search.

The interface has no network loading animation or cancellation action for synchronous work. Navigation, labeled fields, Run Search, witness selection, and expandable calculation traces use native controls with visible keyboard focus. The layout stacks on phones and does not require a wide transaction table.

## Dashboard Scenario and Search Starting Scenario

Dashboard and Financial Diff compare applied contracts under the unchanged formal experiment scenario. That **Dashboard Scenario** may already expose the experiment's intended difference. Hunter uses a separate **Search Starting Scenario** created from that formal data:

- Keep the schema version, scenario ID, and billing month.
- Replace purchases with an empty array.
- Retain every existing payment obligation's ID, due date, and amount.
- Set each existing payment's paid date to its due date.

The original Scenario is validated before this transformation. The independent resulting copy also passes Stage 2 Scenario validation, and Stage 3 compares it under the currently applied contracts. No fixture data is modified, no obligation is added or removed, and an invalid original date cannot be hidden by replacing it.

“Neutral” describes an empty-purchase, on-time starting scenario. It does not mean all fees are zero: The Waiver Trap initially charges USD 12 under both contracts, so its starting delta is zero. The other two unmodified experiments also have zero starting difference. Changed applied terms may produce a nonzero starting difference; Hunter displays the actual engine result instead of enforcing zero. Contract `effectiveDate` remains descriptive metadata and does not prohibit these counterfactual scenarios.

Stage 4A generates bounded uniform-purchase scenarios and applies one shared nonnegative delay to the existing payment events. It preserves obligation IDs, due dates, and amounts. No payment means the delay dimension is irrelevant. Generated purchases stay in the billing month. This family is intentionally smaller than all possible financial scenarios.

## Search controls and units

All fields are required. Each minimum and maximum is inclusive, and a minimum must not exceed its corresponding maximum.

| Control | Default | Allowed range / unit |
| --- | ---: | --- |
| Seed | `20260401` | Integer 0–4,294,967,295. |
| Max Evaluations | `120` | Integer 1–500 actual financial comparisons, including failed comparisons. |
| Max Results | `5` | Integer 1–10 retained witnesses. |
| Purchase Count Min / Max | `0` / `10` | Integer 0–30 purchases. |
| Purchase Amount Min / Max | `1.00` / `10.00` USD | USD 0.01–1,000.00, stored as 1–100,000 integer cents. |
| Late Days Min / Max | `0` / `5` | Integer 0–31 calendar days after each existing due date. |

Text fields use the same exact USD and integer parsers as Financial Diff. USD whole and fractional digits become cents through integer arithmetic, without `parseFloat * 100`. Canonical text such as `1`, `1.00`, or `0.29` is accepted for amounts; amounts require at most two fractional digits. Counts, seed, budgets, and delays accept whole-number digits. Numeric text is limited to 24 characters.

Blank text, spaces, signs, leading zeros, scientific notation, `NaN`, `Infinity`, fractional integer fields, and excess decimals are rejected with associated field errors. Values are not trimmed, rounded, clamped, or replaced. Final numeric values pass the existing strict Stage 4A `SearchOptionsSchema` through `validateSearchOptions`; USD error paths map back to the visible amount fields. Invalid controls prevent the search API call.

The seed drives Stage 4A's local deterministic generator. Repeating the same applied contracts, starting scenario, options, seed, and code revision reproduces the complete report and witness order. Changing the seed changes the input to that generator; it does not promise that every seed produces different retained witnesses, because boundary cases and ranking can remain the same.

## Interpret a SearchReport

A successful API call supplies the original `SearchReport`, including its seed, numeric options, counts, sources, stop reason, coverage, candidate ledger, and retained witnesses. A successful call can report no witness or record failed candidate calculations; it does not imply that every comparison succeeded.

| Statistic | Meaning |
| --- | --- |
| Search Status | `witnesses-found` or `no-witness-found` from the report. |
| Witness Count | Number of complete nonzero-delta witnesses retained, bounded by Max Results. |
| Evaluated Count | Actual calls to the financial comparison engine, including failed calls. |
| Successful Evaluations | Evaluated Count minus Failed Count. |
| Skipped Count | Candidates skipped before financial comparison, such as duplicates or out-of-range candidates. |
| Failed Count | Actual financial comparison calls that returned issues. These consume evaluation budget. |
| Evaluation Budget | The chosen maximum number of comparisons; at most 500. |
| Seed | The explicit seed recorded for this run. |
| Base / Boundary / Seeded Evaluations | Actual comparisons by candidate source. |
| Budget Exhausted | Whether the run consumed its evaluation budget. |
| Stop Reason | `budget`, `space-covered`, or `attempt-limit` from Stage 4A. |
| Visited Parameter Count | Canonical parameter combinations visited in the simplified generated family. This is not a successful-comparison count. |
| Generated Space Size | Number of canonical combinations in that declared family. Irrelevant dimensions are collapsed. |
| Coverage Complete | Whether every canonical parameter tuple in that family was visited. |

`coverage.complete` can include visits that failed date generation or financial calculation. It does not prove successful financial evaluation of every tuple, coverage of all financial scenarios, or general contract equivalence. A budget-limited result is still useful evidence for retained witnesses, with the stated limits.

When no witness is retained, the interface states:

> No counterexample found within the selected search range and budget.

It does not assert that the contracts are equivalent. Witness ranking gives representative cases observed in this run, not a global maximum. Search-level failures are shown through their original structured issue paths, codes, and messages and clear previous success results. Failed calculations never become zero-fee success values.

## Witness Explorer

The list renders every retained witness, with at most ten entries. Each entry shows its candidate ID, source, signed delta, actual purchase count and total, and payment-delay summary. The selected entry displays:

- **Scenario Details:** billing month; every purchase ID, date, and amount; every payment obligation ID, due date, paid date, amount, and actual calendar-day delay.
- **Financial Impact:** old total, new total, signed new-minus-old delta, monthly/transaction/late-fee category deltas, and expandable original calculation traces.
- **Search Evidence:** candidate ID, sequence, source, seed, and the numeric count/amount/delay bounds used for the run.

Positive delta means the new contract costs more; negative means it costs less. Monetary text uses the existing exact Stage 5A cents formatter. Purchase totals derive from actual `Witness.scenario.transactions`, and individual records are rendered from their own amounts; the interface does not assume every transaction has the same amount. Financial values come directly from `Witness.comparison`.

Selecting another witness updates the details without calling search or recalculating fees. Only the selected witness's scenario and trace details are mounted. The full candidate ledger stays in the successful snapshot for completeness but is not expanded into thousands of DOM records.

## Workspace snapshots and result validity

The existing `useWorkspace` owns both contract editing and Hunter state. A successful `SearchSnapshot` retains independent old/new applied-contract inputs, the validated search base, numeric search options, the complete report, and the selected witness ID. The state exists only in page memory. There is no LocalStorage, URL persistence, or remote storage; reloading clears it and returns to the original Waiver Trap Dashboard.

| Action | Result |
| --- | --- |
| Switch Dashboard / Financial Diff / Hunter / Proof | Preserve still-valid settings, report, selected witness, and proof. |
| Type a Financial Diff draft or attempt invalid Apply | Preserve the report because applied contracts have not changed; remind users about pending text. |
| Apply valid contract drafts | Clear report and selection; retain search settings for the next explicit run. |
| Change a seed, range, budget, or result limit | Clear report and selection immediately; do not rerun automatically. |
| Reset to Original | Restore original contracts and default search controls; clear report and selection. |
| Select a different experiment | Restore its original contracts, neutral starting context, and default controls; clear prior results. |
| Select the same experiment | Preserve its current workspace state. |

These transitions prevent a previous report from appearing valid under new applied inputs. A failed run also clears previous success state. The new controls and report use the existing workspace rather than a separate state store.

## Reproduce the three experiments

Use original contracts and the defaults above. The starting delta for each is zero. Each run uses seed `20260401`, performs 120 comparisons, retains five witnesses, and stops with its budget exhausted. The following are observed representatives from the real Stage 4A results:

| Experiment | Representative scenario | Old total | New total | Signed delta | Candidate |
| --- | --- | ---: | ---: | ---: | --- |
| The Waiver Trap | Five purchases of USD 1.00, total USD 5.00. | $0.00 | $12.00 | +$12.00 | `boundary-3` |
| The Microtransaction Penalty | Ten purchases of USD 1.49, total USD 14.90. | $0.10 | $2.10 | +$2.00 | `boundary-1` |
| The Grace Period Shift | Ten purchases of USD 1.00; original payment due `2026-05-15`, paid `2026-05-17`, two calendar days late. | $0.00 | $15.00 | +$15.00 | `boundary-1` |

The runs record respectively 29, 27, and 18 skipped candidates, with no failed financial comparisons. The payment witness retains `grace-payment-1`, its original due date, and its USD 100 obligation amount. Its purchases are displayed as actual scenario data even though they do not determine this experiment's late fee.

For an applied-contract check, change The Waiver Trap's **New Contract → Monthly fee (USD)** from `12.00` to `7.00`, then Apply. The neutral base now costs USD 12 old and USD 7 new, giving a computed delta of −USD 5. A fresh default search produces witnesses under the modified contract, including the five-purchase representative with USD 0 old and USD 7 new, giving +USD 7. The original fixtures retain their USD 12 fee. Reset restores the originals and clears this report.

These amounts are computed over fictional data. Expected examples belong in tests and documentation; the UI and fixtures do not embed financial answers.

## Current scope

Everything runs locally: no backend, database, AI/LLM, banking API, external API, remote asset, or telemetry. Stage 5B-2 adds no runtime dependency and does not change the Stage 2 model, Stage 3 formulas, Stage 4A search, Stage 4B Proof APIs, or formal financial fixtures.

Proof of Impact is available in Stage 5C-1. Its separate explicit action consumes the currently selected witness and saved contracts/options, reduces it through the existing Stage 4B API, and verifies the returned proof. Choosing a different witness, rerunning search, editing search options, valid Apply, Reset, and a different experiment clear old proof and verification; pending drafts and ordinary navigation preserve still-valid evidence. Downloads and proof import remain unavailable until later work, including Stage 5C-2. GitHub Pages publishing is not configured; the existing repository contains push/pull-request CI only. See [PROOF_VIEWER_UI.md](PROOF_VIEWER_UI.md) for the viewer, [COUNTEREXAMPLE_SEARCH.md](COUNTEREXAMPLE_SEARCH.md) for search API details, and [MINIMIZATION_AND_PROOF.md](MINIMIZATION_AND_PROOF.md) for the independent evidence APIs.
