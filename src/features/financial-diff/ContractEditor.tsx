import type { Contract } from '../../models'
import type { ContractDraft, DraftIssue } from './drafts'

interface ContractEditorProps {
  side: 'old' | 'new'
  contract: Contract
  draft: ContractDraft
  issues: DraftIssue[]
  modified: boolean
  onChange(nextDraft: ContractDraft): void
}

interface EditorFieldProps {
  id: string
  label: string
  value: string
  inputMode: 'decimal' | 'numeric'
  hint: string
  issues: DraftIssue[]
  onChange(value: string): void
}

function FieldErrors({ id, issues }: { id: string; issues: DraftIssue[] }) {
  if (issues.length === 0) return null

  return (
    <ul id={`${id}-error`} className="field-error">
      {issues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.message}</li>)}
    </ul>
  )
}

function EditorField({ id, label, value, inputMode, hint, issues, onChange }: EditorFieldProps) {
  return (
    <div className="editor-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        inputMode={inputMode}
        value={value}
        aria-invalid={issues.length > 0 ? true : undefined}
        aria-describedby={`${id}-hint${issues.length > 0 ? ` ${id}-error` : ''}`}
        onChange={(event) => onChange(event.target.value)}
      />
      <p id={`${id}-hint`} className="editor-field-hint">{hint}</p>
      <FieldErrors id={id} issues={issues} />
    </div>
  )
}

export function ContractEditor({ side, contract, draft, issues, modified, onChange }: ContractEditorProps) {
  const label = side === 'old' ? 'Old Contract' : 'New Contract'
  const monthlyDraft = draft.monthlyFee
  const transactionDraft = draft.transactionFee
  const lateDraft = draft.lateFee
  const fieldIssues = (rule: string, field: string) => issues.filter(
    (issue) => issue.path[0] === rule && issue.path[1] === field,
  )
  const waiverId = `${side}-monthlyFee-waiverKind`
  const waiverIssues = fieldIssues('monthlyFee', 'waiverKind')
  const waiverIsAmount = monthlyDraft?.waiverKind === 'minPurchaseTotalCents'

  return (
    <fieldset className="panel contract-editor">
      <legend>{label}</legend>
      <div className="contract-editor-heading">
        <h2>{contract.name}</h2>
        <div className="contract-draft-status">
          <span className="status-pill">Working Draft</span>
          <span className="status-pill">{modified ? 'Applied: Modified' : 'Applied: Original terms'}</span>
        </div>
      </div>
      <dl className="contract-readonly-meta">
        <div><dt>ID</dt><dd>{contract.id}</dd></div>
        <div><dt>Version</dt><dd>{contract.version}</dd></div>
        <div><dt>Currency</dt><dd>{contract.currency}</dd></div>
        <div><dt>Billing cycle</dt><dd>{contract.billingCycle}</dd></div>
        <div><dt>Effective date</dt><dd>{contract.effectiveDate}</dd></div>
      </dl>

      {contract.rules.monthlyFee && monthlyDraft && (
        <section className="editor-rule" aria-labelledby={`${side}-monthlyFee-title`}>
          <h3 id={`${side}-monthlyFee-title`}>Monthly Fee</h3>
          <EditorField
            id={`${side}-monthlyFee-feeUsd`}
            label="Monthly fee (USD)"
            value={monthlyDraft.feeUsd}
            inputMode="decimal"
            hint="Non-negative USD amount, with at most two decimal places."
            issues={fieldIssues('monthlyFee', 'feeUsd')}
            onChange={(value) => onChange({ ...draft, monthlyFee: { ...monthlyDraft, feeUsd: value } })}
          />
          <div className="editor-field">
            <label htmlFor={waiverId}>Waiver condition</label>
            <select
              id={waiverId}
              value={monthlyDraft.waiverKind}
              aria-invalid={waiverIssues.length > 0 ? true : undefined}
              aria-describedby={`${waiverId}-hint${waiverIssues.length > 0 ? ` ${waiverId}-error` : ''}`}
              onChange={(event) => onChange({
                ...draft,
                monthlyFee: { ...monthlyDraft, waiverKind: event.target.value },
              })}
            >
              <option value="minTransactionCount">Minimum purchase count</option>
              <option value="minPurchaseTotalCents">Minimum monthly purchase total</option>
            </select>
            <p id={`${waiverId}-hint`} className="editor-field-hint">
              Changing waiver condition changes the threshold unit; review the value before applying.
            </p>
            <FieldErrors id={waiverId} issues={waiverIssues} />
          </div>
          <EditorField
            id={`${side}-monthlyFee-threshold`}
            label={waiverIsAmount ? 'Monthly purchase total (USD)' : 'Minimum purchases (count)'}
            value={monthlyDraft.threshold}
            inputMode={waiverIsAmount ? 'decimal' : 'numeric'}
            hint={waiverIsAmount
              ? 'Positive USD amount required to waive the monthly fee; at most two decimal places.'
              : 'Positive whole number of purchases required to waive the monthly fee.'}
            issues={fieldIssues('monthlyFee', 'threshold')}
            onChange={(value) => onChange({ ...draft, monthlyFee: { ...monthlyDraft, threshold: value } })}
          />
        </section>
      )}

      {contract.rules.transactionFee && transactionDraft && (
        <section className="editor-rule" aria-labelledby={`${side}-transactionFee-title`}>
          <h3 id={`${side}-transactionFee-title`}>Transaction Fee</h3>
          <EditorField
            id={`${side}-transactionFee-fixedUsd`}
            label="Fixed fee (USD)"
            value={transactionDraft.fixedUsd}
            inputMode="decimal"
            hint="Non-negative USD fee charged per purchase; at most two decimal places."
            issues={fieldIssues('transactionFee', 'fixedUsd')}
            onChange={(value) => onChange({ ...draft, transactionFee: { ...transactionDraft, fixedUsd: value } })}
          />
          <EditorField
            id={`${side}-transactionFee-rateBps`}
            label="Rate (bps)"
            value={transactionDraft.rateBps}
            inputMode="numeric"
            hint="Whole number from 0 to 10,000 basis points. 1 bps = 0.01%."
            issues={fieldIssues('transactionFee', 'rateBps')}
            onChange={(value) => onChange({ ...draft, transactionFee: { ...transactionDraft, rateBps: value } })}
          />
        </section>
      )}

      {contract.rules.lateFee && lateDraft && (
        <section className="editor-rule" aria-labelledby={`${side}-lateFee-title`}>
          <h3 id={`${side}-lateFee-title`}>Late Fee</h3>
          <EditorField
            id={`${side}-lateFee-feeUsd`}
            label="Late fee (USD)"
            value={lateDraft.feeUsd}
            inputMode="decimal"
            hint="Non-negative USD fee; at most two decimal places."
            issues={fieldIssues('lateFee', 'feeUsd')}
            onChange={(value) => onChange({ ...draft, lateFee: { ...lateDraft, feeUsd: value } })}
          />
          <EditorField
            id={`${side}-lateFee-graceDays`}
            label="Grace period (days)"
            value={lateDraft.graceDays}
            inputMode="numeric"
            hint="Non-negative whole number of calendar days. Payment dates remain unchanged."
            issues={fieldIssues('lateFee', 'graceDays')}
            onChange={(value) => onChange({ ...draft, lateFee: { ...lateDraft, graceDays: value } })}
          />
        </section>
      )}
    </fieldset>
  )
}
