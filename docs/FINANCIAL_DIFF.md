# Financial Diff

Stage 5B-1 lets you edit existing rules on independent working copies of the three synthetic experiments. All comparisons use the unchanged experiment scenario and Stage 3 `compareContracts`; the editor contains no fee formulas.

## Editing workflow

1. Open **Financial Diff** using the sidebar. Dashboard and Financial Diff share the same selected experiment and applied contracts.
2. Choose an **Experiment**. Selecting a different experiment discards both unapplied drafts and applied changes, then restores that experiment's original terms. The selector explains this before you change it.
3. Edit fields in **Old Contract** or **New Contract**. **Working Draft** identifies the editable text; **Applied: Original terms** or **Applied: Modified** identifies the contract currently used for results.
4. Choose **Apply Changes**. Both contracts must pass input validation and the formal Stage 2 Contract schema before either working contract is updated.
5. Inspect old/new totals, signed cost difference, category differences, and **Calculation Details**. Navigate to Dashboard to see the same applied results.
6. Choose **Reset to Original** to restore both original contracts and clear pending edits and field errors. The selected experiment and active view stay the same.

Typing does not recalculate fees. Invalid Apply preserves your text and displays errors beside the corresponding fields; current results continue to use the last applied contracts. Positive delta means cost increased, negative means cost decreased, and zero means the same cost. If valid inputs cause engine overflow or another calculation failure, the UI displays its original structured issues instead of success amounts or substitute zero fees.

Changes exist only in this page's memory. There is no browser-storage or server persistence. Reloading starts Dashboard with the original Waiver Trap. Switching views preserves pending and applied changes; switching experiments or reloading discards them. Formal fixtures are never edited.

## Supported fields and units

Only rule categories already present in the selected contract can be edited.

| Rule | Editable fields |
| --- | --- |
| Monthly Fee | Monthly fee in USD; waiver condition; positive threshold in purchase count or USD monthly purchase total. |
| Transaction Fee | Fixed fee per purchase in USD; integer rate from 0 to 10,000 basis points. One basis point is 0.01%. |
| Late Fee | Late fee in USD; non-negative integer grace period in calendar days. Payment dates remain unchanged. |

USD input accepts `0`, `12`, `12.50`, and `500.00`, with at most two decimal places. Fee amounts can be zero; purchase-total waiver thresholds must be at least `0.01`. Numeric text is limited to 24 characters. An exact `BigInt` parser forms integer cents and accepts up to `90071992547409.91` USD (`Number.MAX_SAFE_INTEGER` cents). It does not multiply a parsed floating-point value by 100.

Blank input, spaces, signs, leading zeros such as `01`, scientific notation, `NaN`, `Infinity`, excessive decimal places, and unsafe values are rejected without automatic correction. Counts and days accept digits only; purchase counts must be positive and grace days can be zero. Changing waiver condition changes the threshold unit while retaining the text, so review the threshold before applying.

Contract ID, version, currency, billing cycle, and effective date are read-only. The workspace does not add/remove rule categories, edit scenarios, support other financial products, or import/export contracts.

## Reproduce the Waiver Trap comparison

The original scenario has five purchases of USD 10 each, totaling USD 50. Start with original terms, then edit **New Contract → Monthly purchase total (USD)**:

| New threshold after Apply | Old total | New total | Signed delta |
| --- | ---: | ---: | ---: |
| `50.00` | $0.00 | $0.00 | $0.00 |
| `60.00` | $0.00 | $12.00 | +$12.00 |

These are consequences of the existing engine and fixture inputs, not values embedded in the UI. Reset restores the original USD 500 threshold. The other original experiments compare transaction fees and grace periods; changing their fields also uses the same engine and unchanged scenario.

Counterexample Hunter searches using the same applied working contracts; pending drafts do not affect it. Valid Apply clears previous search results and proofs, while invalid Apply preserves evidence based on unchanged applied terms. Reset also restores default search controls and Max Checks 200 and clears results. See [COUNTEREXAMPLE_UI.md](COUNTEREXAMPLE_UI.md) for the separate neutral search scenario and bounded-search workflow. The [Proof of Impact Viewer](PROOF_VIEWER_UI.md) reduces a selected searched witness and verifies its actual evidence. Pending contract drafts preserve an existing proof and do not enter generation. The current workspace has no runtime external API, backend, or PDF output. Static hosting is documented in [Deployment](DEPLOYMENT.md).
