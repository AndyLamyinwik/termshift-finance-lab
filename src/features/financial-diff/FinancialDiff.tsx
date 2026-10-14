import type { WorkspaceController } from '../workspace/types'
import { ComparisonResults, ExperimentSelector, WorkspaceNotice } from '../workspace/WorkspacePresentation'
import { ContractEditor } from './ContractEditor'

const editableFields: Record<string, readonly string[]> = {
  monthlyFee: ['feeUsd', 'waiverKind', 'threshold'],
  transactionFee: ['fixedUsd', 'rateBps'],
  lateFee: ['feeUsd', 'graceDays'],
}

export default function FinancialDiff({ workspace }: { workspace: WorkspaceController }) {
  const generalIssues = (['old', 'new'] as const).flatMap((side) => workspace.draftIssues[side]
    .filter((issue) => typeof issue.path[0] !== 'string'
      || typeof issue.path[1] !== 'string'
      || !editableFields[issue.path[0]]?.includes(issue.path[1]))
    .map((issue) => ({ side, issue })))

  return (
    <main id="financial-diff" className="dashboard-main" tabIndex={-1}>
      <div className="dashboard-titlebar">
        <div>
          <p className="eyebrow">Financial Contract Counterexample Lab</p>
          <h1>Financial Diff</h1>
          <p className="dashboard-intro">
            Edit working copies of the old and new contracts, then apply validated changes
            to compare their costs using the same scenario.
          </p>
        </div>
        <span className="status-pill">Computed locally</span>
      </div>

      <section className="panel experiment-section" aria-labelledby="experiment-title">
        <ExperimentSelector workspace={workspace} />
      </section>
      <WorkspaceNotice workspace={workspace} />

      <form
        className="contract-edit-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          workspace.applyChanges()
        }}
      >
        <div className="section-heading">
          <div>
            <h2>Working contract drafts</h2>
            <p>
              Edit only the rules present in this experiment: monthly, transaction or late fees.
              Adding rule categories and other financial products is not supported.
            </p>
          </div>
        </div>
        <div className="contract-editor-grid">
          <ContractEditor
            side="old"
            contract={workspace.workingOldContract}
            draft={workspace.draftOldContract}
            issues={workspace.draftIssues.old}
            modified={workspace.oldModified}
            onChange={(draft) => workspace.updateDraft('old', draft)}
          />
          <ContractEditor
            side="new"
            contract={workspace.workingNewContract}
            draft={workspace.draftNewContract}
            issues={workspace.draftIssues.new}
            modified={workspace.newModified}
            onChange={(draft) => workspace.updateDraft('new', draft)}
          />
        </div>

        {workspace.applyStatus === 'invalid' && (
          <div className="panel error-panel draft-apply-error" role="alert">
            <h2>Unable to apply contract changes</h2>
            <p>
              Correct the highlighted fields before applying. Your inputs are preserved.
              Current results belong to the last applied valid contracts.
            </p>
            {generalIssues.length > 0 && (
              <ul className="error-list">
                {generalIssues.map(({ side, issue }, index) => (
                  <li key={`${side}-${issue.code}-${index}`}>
                    {side === 'old' ? 'Old Contract' : 'New Contract'}: {issue.message}
                    {' '}({issue.code}{issue.path.length > 0 ? ` · ${issue.path.join('.')}` : ''})
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="editor-actions">
          <button type="submit" className="button-primary">Apply Changes</button>
          <button type="button" className="button-secondary" onClick={workspace.resetOriginal}>
            Reset to Original
          </button>
          <p>Reset restores both original contracts and clears unapplied edits.</p>
        </div>
      </form>

      <p className="dashboard-subtitle">Last applied contract results · same experiment scenario</p>
      <ComparisonResults workspace={workspace} includeDetails />
    </main>
  )
}
