import type { Contract } from '../../models'
import { ComparisonResults, ExperimentSelector, WorkspaceNotice } from '../workspace/WorkspacePresentation'
import type { WorkspaceController } from '../workspace/types'
import { formatUsdCents } from './format'

function ContractTerms({ contract, label, modified }: { contract: Contract; label: string; modified: boolean }) {
  const { monthlyFee, transactionFee, lateFee } = contract.rules
  return (
    <article className="contract-card" aria-label={`${label} terms`}>
      <p className="contract-label">{label}</p>
      <h3>{contract.name}</h3>
      <p className="contract-meta">Version {contract.version} · {contract.currency}</p>
      <p className="working-copy-label">Working copy · {modified ? 'Modified' : 'Original experiment terms'}</p>
      <ul className="contract-rules">
        {monthlyFee && <li>
          <span>Monthly fee</span><strong>{formatUsdCents(monthlyFee.feeCents)}</strong>
          <p>Waived with at least {monthlyFee.waiver.kind === 'minTransactionCount'
            ? `${monthlyFee.waiver.threshold} purchases`
            : `${formatUsdCents(monthlyFee.waiver.threshold)} in monthly purchases`}.</p>
        </li>}
        {transactionFee && <li>
          <span>Transaction fee</span><strong>{transactionFee.rateBps} bps + {formatUsdCents(transactionFee.fixedCents)}</strong>
          <p>Rate and fixed fee apply to each purchase.</p>
        </li>}
        {lateFee && <li>
          <span>Late fee</span><strong>{formatUsdCents(lateFee.feeCents)}</strong>
          <p>Charged after a {lateFee.graceDays}-day grace period.</p>
        </li>}
      </ul>
    </article>
  )
}

export default function Dashboard({ workspace }: { workspace: WorkspaceController }) {
  return (
    <main id="dashboard" className="dashboard-main" tabIndex={-1}>
      <div className="dashboard-titlebar">
        <div>
          <p className="eyebrow">Financial Contract Counterexample Lab</p>
          <h1>Financial contract lab</h1>
          <p className="dashboard-intro">
            An explainable financial contract simulation and counterexample discovery engine.
            Compare real calculations across three synthetic experiments.
          </p>
        </div>
        <span className="status-pill">Computed locally</span>
      </div>
      <section className="panel" aria-labelledby="public-rate-case-title">
        <p className="eyebrow">Published-rate case study · USD</p>
        <h2 id="public-rate-case-title">PayPal: two published plans</h2>
        <p className="dashboard-intro">
          Compare Checkout and a Static Micropayments rate model, with dated sources,
          independent expected fees and portable evidence. This is a plan A/B comparison.
        </p>
        <a href={`${import.meta.env.BASE_URL}case-studies/paypal-usd/`} target="_blank" rel="noopener noreferrer">
          Read the PayPal USD case study (opens in a new tab)
        </a>
      </section>
      <section className="panel experiment-section" aria-labelledby="experiment-title">
        <ExperimentSelector workspace={workspace} />
        <div className="contract-grid">
          <ContractTerms contract={workspace.workingOldContract} label="Old Contract" modified={workspace.oldModified} />
          <ContractTerms contract={workspace.workingNewContract} label="New Contract" modified={workspace.newModified} />
        </div>
      </section>
      <WorkspaceNotice workspace={workspace} />
      <ComparisonResults workspace={workspace} />
    </main>
  )
}
