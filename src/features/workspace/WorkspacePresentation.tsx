import { experiments } from '../../scenarios'
import { CalculationDetails } from '../dashboard/CalculationDetails'
import { FeeBreakdown, FinancialSummary } from '../dashboard/ComparisonPanels'
import { formatDeltaCents, formatUsdCents, getCostDirection } from '../dashboard/format'
import type { WorkspaceController } from './types'

export function ExperimentSelector({ workspace }: { workspace: WorkspaceController }) {
  const experiment = workspace.selectedExperiment
  return (
    <>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Synthetic financial experiment</p>
          <h2 id="experiment-title">Choose an experiment</h2>
        </div>
        <div className="experiment-control">
          <label htmlFor="experiment-select">Experiment</label>
          <select id="experiment-select" value={experiment.id} aria-describedby="experiment-switch-note"
            onChange={(event) => workspace.selectExperiment(event.target.value)}>
            {experiments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </div>
      </div>
      <p id="experiment-switch-note" className="workspace-hint">
        Selecting a different experiment discards your current drafts and applied changes, then loads original terms.
      </p>
      <dl className="experiment-context">
        <div><dt>Billing month</dt><dd>{experiment.scenario.billingMonth}</dd></div>
        <div><dt>Purchases</dt><dd>{experiment.scenario.transactions.length}</dd></div>
        <div><dt>Completed payments</dt><dd>{experiment.scenario.paymentEvents.length}</dd></div>
      </dl>
    </>
  )
}

export function WorkspaceNotice({ workspace }: { workspace: WorkspaceController }) {
  const modified = workspace.oldModified || workspace.newModified
  return (
    <aside className={`workspace-notice ${workspace.hasUnappliedChanges ? 'pending' : ''}`} aria-label="Workspace status">
      <p className="workspace-version">
        <strong>{modified ? 'Modified working contracts' : 'Original experiment terms · Working copies'}</strong>
        <span>{workspace.hasUnappliedChanges ? 'Unapplied changes' : 'No unapplied changes'}</span>
      </p>
      <p>Changes stay in this page’s memory only. Reloading restores the original experiment.</p>
      <p className="workspace-feedback" aria-live="polite" aria-atomic="true">
        {workspace.hasUnappliedChanges
          ? 'Results still use the last applied contracts. Apply Changes in Financial Diff to use your draft.'
          : workspace.applyStatus === 'applied'
            ? 'Contract validation passed. Changes applied to the working contracts.'
            : workspace.applyStatus === 'reset' ? 'Original experiment terms restored.'
              : 'Results use the current applied working contracts.'}
      </p>
    </aside>
  )
}

export function ComparisonResults({ workspace, includeDetails = true }: {
  workspace: WorkspaceController
  includeDetails?: boolean
}) {
  const result = workspace.comparison
  if (!result.success) {
    return (
      <section className="panel error-panel" role="alert" aria-labelledby="calculation-error-title">
        <h2 id="calculation-error-title">Unable to calculate this experiment</h2>
        <p>The engine reported these issues for the applied contracts. Adjust the rules or reset to original terms.</p>
        <ul className="error-list">
          {result.issues.map((issue, index) => (
            <li key={`${issue.code}-${index}`}>
              {issue.message} ({issue.code}{issue.path.length ? ` · ${issue.path.join('.')}` : ''})
            </li>
          ))}
        </ul>
      </section>
    )
  }
  return (
    <>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {workspace.selectedExperiment.name}. Old contract cost {formatUsdCents(result.data.oldEvaluation.totalCents)}.
        {' '}New contract cost {formatUsdCents(result.data.newEvaluation.totalCents)}.
        {' '}Cost difference {formatDeltaCents(result.data.deltaCents)}.
        {' '}{getCostDirection(result.data.deltaCents).label}.
      </p>
      <FinancialSummary comparison={result.data} oldModified={workspace.oldModified} newModified={workspace.newModified} />
      <FeeBreakdown comparison={result.data} />
      {includeDetails && <CalculationDetails key={`${workspace.selectedExperimentId}-${workspace.activeView}`} comparison={result.data} />}
    </>
  )
}
