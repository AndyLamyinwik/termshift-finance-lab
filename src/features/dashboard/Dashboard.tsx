import { useMemo, useState } from 'react'
import { compareContracts } from '../../engine'
import type { Contract } from '../../models'
import { experiments } from '../../scenarios'
import { CalculationDetails } from './CalculationDetails'
import { FeeBreakdown, FinancialSummary } from './ComparisonPanels'
import { formatUsdCents, formatDeltaCents, getCostDirection } from './format'

function ContractTerms({ contract, label }: { contract: Contract; label: string }) {
  const { monthlyFee, transactionFee, lateFee } = contract.rules

  return (
    <article className="contract-card" aria-label={`${label} terms`}>
      <p className="contract-label">{label}</p>
      <h3>{contract.name}</h3>
      <p className="contract-meta">Version {contract.version} · {contract.currency}</p>
      <ul className="contract-rules">
        {monthlyFee && (
          <li>
            <span>Monthly fee</span>
            <strong>{formatUsdCents(monthlyFee.feeCents)}</strong>
            <p>
              Waived with at least{' '}
              {monthlyFee.waiver.kind === 'minTransactionCount'
                ? `${monthlyFee.waiver.threshold} purchases`
                : `${formatUsdCents(monthlyFee.waiver.threshold)} in monthly purchases`}.
            </p>
          </li>
        )}
        {transactionFee && (
          <li>
            <span>Transaction fee</span>
            <strong>{transactionFee.rateBps} bps + {formatUsdCents(transactionFee.fixedCents)}</strong>
            <p>Rate and fixed fee apply to each purchase.</p>
          </li>
        )}
        {lateFee && (
          <li>
            <span>Late fee</span>
            <strong>{formatUsdCents(lateFee.feeCents)}</strong>
            <p>Charged after a {lateFee.graceDays}-day grace period.</p>
          </li>
        )}
      </ul>
    </article>
  )
}

export default function Dashboard() {
  const [selectedId, setSelectedId] = useState<string>(experiments[0].id)
  const experiment = experiments.find((item) => item.id === selectedId) ?? experiments[0]
  const result = useMemo(
    () => compareContracts(experiment.oldContract, experiment.newContract, experiment.scenario),
    [experiment],
  )

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

      <section className="panel experiment-section" aria-labelledby="experiment-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Synthetic financial experiment</p>
            <h2 id="experiment-title">Choose an experiment</h2>
          </div>
          <div className="experiment-control">
            <label htmlFor="experiment-select">Experiment</label>
            <select
              id="experiment-select"
              value={experiment.id}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              {experiments.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </div>
        </div>

        <dl className="experiment-context">
          <div><dt>Billing month</dt><dd>{experiment.scenario.billingMonth}</dd></div>
          <div><dt>Purchases</dt><dd>{experiment.scenario.transactions.length}</dd></div>
          <div><dt>Completed payments</dt><dd>{experiment.scenario.paymentEvents.length}</dd></div>
        </dl>

        <div className="contract-grid">
          <ContractTerms contract={experiment.oldContract} label="Old Contract" />
          <ContractTerms contract={experiment.newContract} label="New Contract" />
        </div>
      </section>

      {result.success ? (
        <>
          <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
            {experiment.name}. Old contract cost {formatUsdCents(result.data.oldEvaluation.totalCents)}.
            {' '}New contract cost {formatUsdCents(result.data.newEvaluation.totalCents)}.
            {' '}Cost difference {formatDeltaCents(result.data.deltaCents)}.
            {' '}{getCostDirection(result.data.deltaCents).label}.
          </p>
          <FinancialSummary comparison={result.data} />
          <FeeBreakdown comparison={result.data} />
          <CalculationDetails key={experiment.id} comparison={result.data} />
        </>
      ) : (
        <section className="panel error-panel" role="alert" aria-labelledby="calculation-error-title">
          <h2 id="calculation-error-title">Unable to calculate this experiment</h2>
          <p>The calculation engine reported the following issues. Select another experiment to continue.</p>
          <ul className="error-list">
            {result.issues.map((issue, index) => (
              <li key={`${issue.code}-${index}`}>
                {issue.message} ({issue.code}{issue.path.length > 0 ? ` · ${issue.path.join('.')}` : ''})
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
