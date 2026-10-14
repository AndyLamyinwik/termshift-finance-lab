import type { SearchOptionsDraft } from './options'
import type { WorkspaceController } from '../workspace/types'

const fields: ReadonlyArray<{
  key: keyof SearchOptionsDraft
  label: string
  hint: string
  inputMode: 'numeric' | 'decimal'
}> = [
  { key: 'seed', label: 'Seed', hint: 'Whole number from 0 to 4,294,967,295.', inputMode: 'numeric' },
  { key: 'maxEvaluations', label: 'Max Evaluations', hint: '1–500 actual financial comparisons, including failed comparisons.', inputMode: 'numeric' },
  { key: 'maxResults', label: 'Max Results', hint: 'Keep 1–10 witnesses from this search.', inputMode: 'numeric' },
  { key: 'purchaseCountMin', label: 'Purchase Count Min', hint: '0–30 purchases; minimum must not exceed maximum.', inputMode: 'numeric' },
  { key: 'purchaseCountMax', label: 'Purchase Count Max', hint: '0–30 purchases.', inputMode: 'numeric' },
  { key: 'purchaseAmountUsdMin', label: 'Purchase Amount Min (USD)', hint: '$0.01–$1,000.00 per purchase; at most two decimal places.', inputMode: 'decimal' },
  { key: 'purchaseAmountUsdMax', label: 'Purchase Amount Max (USD)', hint: '$0.01–$1,000.00; minimum must not exceed maximum.', inputMode: 'decimal' },
  { key: 'lateDaysMin', label: 'Late Days Min', hint: '0–31 calendar days after the due date; minimum must not exceed maximum.', inputMode: 'numeric' },
  { key: 'lateDaysMax', label: 'Late Days Max', hint: '0–31 calendar days. Applies to existing payment obligations.', inputMode: 'numeric' },
]

export function SearchControls({ workspace }: { workspace: WorkspaceController }) {
  const generalIssues = workspace.searchIssues.filter((issue) => !fields.some(({ key }) => issue.path[0] === key))
  return (
    <form className="panel hunter-controls" aria-label="Search Controls" noValidate onSubmit={(event) => {
      event.preventDefault()
      workspace.runSearch()
    }}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Deterministic, bounded search</p>
          <h2>Search Controls</h2>
        </div>
        <p>Inputs change the next search. Run Search to evaluate them.</p>
      </div>
      <div className="hunter-controls-grid">
        {fields.map(({ key, label, hint, inputMode }) => {
          const id = `hunter-${key}`
          const issues = workspace.searchIssues.filter((issue) => issue.path[0] === key)
          return (
            <div className="editor-field" key={key}>
              <label htmlFor={id}>{label}</label>
              <input id={id} type="text" inputMode={inputMode} value={workspace.searchDraft[key]}
                aria-invalid={issues.length > 0 ? true : undefined}
                aria-describedby={`${id}-hint${issues.length > 0 ? ` ${id}-error` : ''}`}
                onChange={(event) => workspace.updateSearchDraft(key, event.target.value)} />
              <p id={`${id}-hint`} className="editor-field-hint">{hint}</p>
              {issues.length > 0 && <ul id={`${id}-error`} className="field-error">
                {issues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.message}</li>)}
              </ul>}
            </div>
          )
        })}
      </div>
      {workspace.searchIssues.length > 0 && <div className="hunter-validation-error" role="alert">
        <p><strong>Unable to run search.</strong> Correct the highlighted search options.</p>
        {generalIssues.length > 0 && <ul className="error-list">
          {generalIssues.map((issue, index) => <li key={`${issue.code}-${index}`}>
            {issue.message} ({issue.code}{issue.path.length > 0 ? ` · ${issue.path.join('.')}` : ''})
          </li>)}
        </ul>}
      </div>}
      <div className="editor-actions">
        <button type="submit" className="button-primary">Run Search</button>
        <p>Runs locally using the current applied contracts. Settings and results stay in page memory.</p>
      </div>
    </form>
  )
}
