# Portable Impact Evidence

Stage 5C-2 lets Proof of Impact save complete JSON evidence, save the existing Markdown report, and independently verify a local saved proof. Every calculation and file operation happens locally in the browser. The implementation uses the unchanged Stage 4B ImpactProofSchema, `verifyImpactProof`, `formatImpactReport`, and shared Proof Viewer. It adds no runtime dependency, backend, financial formula, or alternative proof format.

## JSON and Markdown

| File | Meaning | Reverification |
| --- | --- | --- |
| `termshift-impact-proof.json` | Complete ImpactProof, including embedded inputs, results, accepted reductions, policies, and limitations. | Accepted by the official schema and recalculated with `verifyImpactProof`. |
| `termshift-impact-report.md` | Human-readable report returned by the existing verified `formatImpactReport`. | Readable financial explanation; it does not replace complete Proof JSON. |

The JSON preserves both Contracts, witness candidate/source/sequence, Search Options and Seed, Original/Minimized Scenario and Comparison, Reduction Steps, minimization budget, Calculation Policy, algorithm versions, and Limitations. No hash or additional wrapper is required. Its `proofSchemaVersion` is `1`; engine/minimizer versions remain the existing `stage3-v1` and `stage4b-v1`.

Markdown preserves the existing formatter's contract details, scenario records, fee/category totals and signed differences, reductions, reproduction information, and limits. TermShift neither executes Markdown nor renders it as HTML. It does not introduce a PDF report pipeline.

## Export a verified proof

1. In Hunter, choose an experiment and **Run Search**. Select a retained nonzero-delta witness.
2. In **Proof of Impact**, choose **Current Workspace Proof**, set Max Checks, and **Generate Proof**. The creator's success is independently checked by the formal verifier before Verified is displayed.
3. Choose **Download JSON** or **Download Markdown** in Evidence Actions. You may also export a successfully verified **Imported Proof** after selecting that source.
4. Save the native browser download locally. JSON can later be imported and verified independently.

Both download buttons are disabled without a success state for the selected source. Before JSON export, `prepareProofJsonExport` calls `verifyImpactProof` afresh and serializes its complete validated proof with `JSON.stringify(proof, null, 2)`. Official schema validation may canonicalize property order; all field data is retained. Markdown export directly uses `formatImpactReport(proof)`, which verifies the input itself. Formal failures preserve code, path, and message and produce no download.

`downloadTextFile` creates a native Blob (`application/json;charset=utf-8` or `text/markdown;charset=utf-8`), assigns its Object URL to a temporary download anchor, and dispatches the native click. The anchor is removed in `finally`; the Object URL is revoked on the next task after dispatch, including failure cleanup. This flow does not upload data, call an API, or retain a permanent browser URL.

## Import a local proof

Use **Import Proof JSON**, a standard `<input type="file" accept=".json,application/json">`. The accept attribute helps choose a file; it is not validation or evidence of trust. Extensions, filenames, MIME types, and JSON claims such as `verified: true` do not establish success.

The import pipeline is:

1. Require a selected File and a valid nonnegative size.
2. Reject files larger than **5 MiB (5,242,880 bytes)** before allocating a read. Exactly 5 MiB is allowed.
3. Read bytes with native `FileReader.readAsArrayBuffer`, handling errors and aborted reads. Check actual byte length again.
4. Decode UTF-8 with `TextDecoder('utf-8', { fatal: true })`; malformed byte sequences fail rather than being repaired. A valid UTF-8 BOM is accepted.
5. Parse JSON inside a caught exception boundary.
6. Call official `ImpactProofSchema.safeParse`. The strict proof structure, required embedded fields, supported version, array limits, and nested input schemas must pass.
7. Call official `verifyImpactProof`. It recomputes original/minimized and accepted-step Comparisons and checks ranges, preserved obligations, budget consistency, reduction transitions, and nonzero delta direction.

The **5 MiB limit is an import-file allocation constraint, not a monetary amount limit**. Current monetary inputs and outputs still follow the existing USD safe-integer cents model. A small file can contain an invalid large monetary value, and a size-valid file can still fail schema or financial verification.

The selected file is untrusted inert data. Malformed UTF-8/JSON, unsupported versions, missing fields, unknown fields, and forged calculations produce readable structured failures. A schema-valid modification to fees, accepted-step validation, or preserved payment obligations is rejected by the formal verifier. No custom UI proof validator or financial formula attempts to repair or endorse the file.

## Separate evidence sources

**Current Workspace Proof** is generated from the active Hunter SearchSnapshot. Its existing invalidation rules continue to apply to contracts, controls, witnesses, and resets.

**Imported Proof** is an independent saved calculation record. It uses its own embedded Contracts and witness. It need not match any built-in experiment or the current working contract names. The imported presentation says:

> Imported proof verified independently against its embedded contracts.

Import never replaces Financial Diff contracts, modifies SearchSnapshot, creates a Hunter witness, or edits formal fixtures. Apply, Reset, changing experiments, running another search, and generating/clearing current proof do not rewrite imported evidence. A current workspace contract can disagree with an imported contract; verification makes no consistency claim between those sources.

The existing `useWorkspace` holds `ImportedProofState` separately from current ProofState and selects a source with `evidenceView`. Overview, BeforeAfterComparison, ReductionTimeline, Financial Explanation, and Limitations are shared. Only the selected evidence body is mounted, preserving the existing bounded timeline and avoiding duplicate metadata IDs. Imported Overview reads embedded Contract IDs, names, and witness data without appending the selected experiment's unrelated name.

**Clear Imported Proof** clears imported state and invalidates pending reads only. It keeps current working contracts, SearchSnapshot, and valid Current Workspace Proof. **Verify Imported Proof Again** calls the official verifier on the saved imported proof without search or minimization. A failed retry removes Verified and success panels; supported retry state can retain the proof for another formal verification attempt.

## Status and asynchronous reads

| Imported state | Display meaning |
| --- | --- |
| Idle | No imported proof. |
| Reading | Native local file read in progress; no previous imported success is retained. |
| Import failed | File selection, read, decoding, JSON, or schema failure; structured issues are shown. |
| Verification failed | The formal verifier rejected embedded calculations or constraints; no Verified badge or success financial data. |
| Success | Formal verification passed; Verified imported proof and actual financial results are displayed. |

Starting any new import removes prior imported success immediately. A request counter identifies the latest selection. Older read successes, failures, and exceptions cannot overwrite a newer selection; Clear Imported Proof and unmount invalidate pending requests. The native input is reset after selection so the same file can be selected again. The workspace retains the verified proof, verification payload, and a display filename, without retaining File handles, raw bytes, or raw JSON text.

Both sources live only in React page memory. Reload clears imported and current evidence and restores initial workspace state. There is no LocalStorage, SessionStorage, IndexedDB, account, cloud storage, or automatic persistence. Explicitly downloaded files remain on the user's device and require another explicit import to view again.

## Interpretation and security limits

Verified means the submitted calculations and reduction constraints agree with the current implementation and embedded data. It **does not authenticate the file's author, supply a digital signature, prove historical search execution, guarantee globally minimal witnesses, or certify a financial product**. Someone can create different internally consistent synthetic evidence. Supported versions and engine policies describe calculation compatibility, not a provenance authority.

Contracts support USD only, integer cents, calendar-month billing, and the existing monthly, per-transaction, and completed-payment late fee rules. Rates use integer basis points; rounding is per-transaction half up; dates are Gregorian calendar days; effectiveDate is descriptive counterfactual metadata. Unpaid balances, partial repayments, minimum payments, interest, compounding, real account-level regulation, and other currencies remain outside the model.

Imported names, filenames, errors, and proof text use React's default escaped text rendering. The app does not use `dangerouslySetInnerHTML`, `eval`, dynamic script execution, a Markdown HTML renderer, or external resource loading from imported content. File names containing HTML and contract names containing scripts remain inert text. Native buttons and the file input have accessible labels, disabled states, keyboard operation, live statuses, and alert errors. Layouts wrap long filenames and errors at 320, 390, 768, and 1440px.

No AI/LLM, backend, database, runtime API, tracking, external CDN, remote image/font, or file upload is used. PDF generation, GitHub Pages deployment, Release creation, Stage 6, and Stage 7 are outside this stage.

## Verification and development

Tests preserve existing flows and exercise real Stage 4A/4B proofs for all three experiments, complete JSON round trips, Markdown equality with the official formatter, schema and tamper rejection, native File/Blob reads, size boundaries, UTF-8 failures, suspicious filenames/MIME, race handling, source isolation, clear/retry behavior, safe text, no runtime requests/storage, and Object URL cleanup. Some controlled failures use mocks, while the core proof generation and many DOM flows use the real APIs.

Run the unchanged local and CI checks:

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

See [PROOF_VIEWER_UI.md](PROOF_VIEWER_UI.md) for generation, reduction timeline, and current-workspace invalidation; [MINIMIZATION_AND_PROOF.md](MINIMIZATION_AND_PROOF.md) for formal evidence APIs; and [ARCHITECTURE.md](ARCHITECTURE.md) for state and module boundaries.
