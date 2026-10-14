import type { Contract } from '../../models'
import { formatDeltaCents, formatUsdCents, getCostDirection } from '../dashboard/format'
import { ExperimentSelector, WorkspaceNotice } from '../workspace/WorkspacePresentation'
import type { WorkspaceController } from '../workspace/types'
import { SearchControls } from './SearchControls'
import { SearchSummary } from './SearchSummary'
import { WitnessExplorer } from './WitnessExplorer'

function AppliedContract({ contract, label, modified }: { contract: Contract; label: string; modified: boolean }) {
  const { monthlyFee, transactionFee, lateFee } = contract.rules
  return (
    <article className="contract-card" aria-label={`${label} search terms`}>
      <p className="contract-label">{label}</p><h3>{contract.name}</h3>
      <p className="contract-meta">Version {contract.version} · {contract.id}</p>
      <p className="working-copy-label">Applied working copy · {modified ? 'Modified' : 'Original experiment terms'}</p>
      <ul className="contract-rules">
        {monthlyFee && <li><span>Monthly fee</span><strong>{formatUsdCents(monthlyFee.feeCents)}</strong>
          <p>Waived with at least {monthlyFee.waiver.kind === 'minTransactionCount'
            ? `${monthlyFee.waiver.threshold} purchases`
            : `${formatUsdCents(monthlyFee.waiver.threshold)} in monthly purchases`}.</p></li>}
        {transactionFee && <li><span>Transaction fee</span>
          <strong>{transactionFee.rateBps} bps + {formatUsdCents(transactionFee.fixedCents)}</strong>
          <p>Proportional rate and fixed fee per purchase.</p></li>}
        {lateFee && <li><span>Late fee</span><strong>{formatUsdCents(lateFee.feeCents)}</strong>
          <p>Grace period: {lateFee.graceDays} calendar days.</p></li>}
      </ul>
    </article>
  )
}

function StartingScenario({ workspace }: { workspace: WorkspaceController }) {
  const base = workspace.searchBase
  const comparison = workspace.searchBaseComparison
  return (
    <section className="panel hunter-starting" aria-labelledby="hunter-starting-title">
      <div className="section-heading">
        <div><p className="eyebrow">Independent neutral copy</p><h2 id="hunter-starting-title">Search Starting Scenario</h2></div>
      </div>
      <p>
        Search starts with no purchases. Existing payment obligations keep their IDs, due dates and amounts,
        with Paid On set to Due On. Dashboard Scenario keeps the original experiment transactions and payment dates.
      </p>
      {!base.success ? <div role="alert"><p>Unable to validate the search starting scenario.</p>
        <ul className="error-list">{base.issues.map((issue, index) => <li key={`${issue.code}-${index}`}>
          {issue.message} ({issue.code}{issue.path.length > 0 ? ` · ${issue.path.join('.')}` : ''})
        </li>)}</ul></div> : <>
        <dl className="hunter-context-grid">
          <div><dt>Scenario ID</dt><dd>{base.data.id}</dd></div>
          <div><dt>Billing Month</dt><dd>{base.data.billingMonth}</dd></div>
          <div><dt>Starting Purchases</dt><dd>{base.data.transactions.length}</dd></div>
          <div><dt>Existing Payment Obligations</dt><dd>{base.data.paymentEvents.length}</dd></div>
        </dl>
        {base.data.paymentEvents.length > 0 && <ul className="hunter-event-list">
          {base.data.paymentEvents.map((payment) => <li key={payment.id}><strong>{payment.id}</strong>
            <dl className="hunter-event-values">
              <div><dt>Due On</dt><dd>{payment.dueOn}</dd></div>
              <div><dt>Paid On</dt><dd>{payment.paidOn}</dd></div>
              <div><dt>Amount</dt><dd>{formatUsdCents(payment.amountCents)}</dd></div>
            </dl>
          </li>)}
        </ul>}
      </>}
      {comparison?.success && <dl className="hunter-starting-costs">
        <div><dt>Starting Old Cost</dt><dd>{formatUsdCents(comparison.data.oldEvaluation.totalCents)}</dd></div>
        <div><dt>Starting New Cost</dt><dd>{formatUsdCents(comparison.data.newEvaluation.totalCents)}</dd></div>
        <div className={getCostDirection(comparison.data.deltaCents).kind}><dt>Starting Cost Difference</dt>
          <dd>{formatDeltaCents(comparison.data.deltaCents)}</dd></div>
      </dl>}
      {comparison && !comparison.success && <div role="alert"><p>Unable to calculate the search starting scenario.</p>
        <ul className="error-list">{comparison.issues.map((issue, index) => <li key={`${issue.code}-${index}`}>
          {issue.message} ({issue.code}{issue.path.length > 0 ? ` · ${issue.path.join('.')}` : ''})
        </li>)}</ul></div>}
      <p className="workspace-hint">Starting costs come from the calculation engine and the applied working contracts.</p>
    </section>
  )
}

export default function CounterexampleHunter({ workspace }: { workspace: WorkspaceController }) {
  const snapshot = workspace.searchSnapshot
  return (
    <main id="counterexample-hunter" className="dashboard-main hunter-main" tabIndex={-1}>
      <div className="dashboard-titlebar">
        <div><p className="eyebrow">Financial Contract Counterexample Lab</p><h1>Counterexample Hunter</h1>
          <p className="dashboard-intro">Search a bounded range of synthetic scenarios for cost differences between applied contracts.
            Inspect retained witnesses and their recorded financial impact.</p></div>
        <span className="status-pill">Computed locally</span>
      </div>
      <section className="panel experiment-section" aria-labelledby="experiment-title">
        <ExperimentSelector workspace={workspace} />
        <p className="workspace-hint"><strong>Dashboard Scenario</strong>: the original scenario shown by Dashboard and Financial Diff.
          Search uses the separate Search Starting Scenario below.</p>
        <div className="contract-grid">
          <AppliedContract contract={workspace.workingOldContract} label="Old Contract" modified={workspace.oldModified} />
          <AppliedContract contract={workspace.workingNewContract} label="New Contract" modified={workspace.newModified} />
        </div>
      </section>
      <WorkspaceNotice workspace={workspace} />
      {workspace.hasUnappliedChanges && <p className="hunter-pending-note">
        Search uses the last applied working contracts. Unapplied Financial Diff drafts are excluded.
      </p>}
      <StartingScenario workspace={workspace} />
      <SearchControls workspace={workspace} />
      {workspace.searchFailure.length > 0 && <section className="panel error-panel" role="alert">
        <h2>Unable to complete counterexample search</h2>
        <p>The search engine reported these issues. No successful report is available for this run.</p>
        <ul className="error-list">{workspace.searchFailure.map((issue, index) => <li key={`${issue.code}-${index}`}>
          {issue.message} ({issue.code}{issue.path.length > 0 ? ` · ${issue.path.join('.')}` : ''})
        </li>)}</ul>
      </section>}
      {snapshot ? <>
        <SearchSummary report={snapshot.searchReport} />
        <WitnessExplorer workspace={workspace} snapshot={snapshot} />
      </> : workspace.searchFailure.length === 0 && <p className="hunter-empty-note">
        No current search results. Run Search with valid options to discover witnesses.
        Applied contract changes, experiment changes and search option changes clear previous results.
      </p>}
    </main>
  )
}
