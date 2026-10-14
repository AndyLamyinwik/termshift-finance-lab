import type { Comparison } from '../../engine'
import { formatUsdCents, formatDeltaCents, getCostDirection } from './format'

export function FinancialSummary({ comparison, oldModified = false, newModified = false }: {
  comparison: Comparison
  oldModified?: boolean
  newModified?: boolean
}) {
  const direction = getCostDirection(comparison.deltaCents)

  return (
    <section className="financial-section" aria-labelledby="financial-summary-title">
      <div className="section-heading">
        <h2 id="financial-summary-title">Financial Summary</h2>
        <p>Fees for this scenario · USD</p>
      </div>
      <div className="summary-grid">
        <article className="metric-card" aria-label="Old Contract Cost">
          <h3 className="metric-label">Old Contract Cost</h3>
          <p className="metric-value">{formatUsdCents(comparison.oldEvaluation.totalCents)}</p>
          <p className="metric-note">{oldModified ? 'Modified working terms' : 'Original experiment terms'}</p>
        </article>
        <article className="metric-card" aria-label="New Contract Cost">
          <h3 className="metric-label">New Contract Cost</h3>
          <p className="metric-value">{formatUsdCents(comparison.newEvaluation.totalCents)}</p>
          <p className="metric-note">{newModified ? 'Modified working terms' : 'Original experiment terms'}</p>
        </article>
        <article className={`metric-card ${direction.kind}`} aria-label="Cost Difference">
          <h3 className="metric-label">Cost Difference</h3>
          <p className="metric-value">{formatDeltaCents(comparison.deltaCents)}</p>
          <p className="metric-note">{direction.label}</p>
        </article>
      </div>
    </section>
  )
}

const feeCategories = [
  { key: 'monthlyFeeCents', label: 'Monthly Fee' },
  { key: 'transactionFeeCents', label: 'Transaction Fee' },
  { key: 'lateFeeCents', label: 'Late Fee' },
] as const

export function FeeBreakdown({ comparison }: { comparison: Comparison }) {
  const scale = Math.max(
    ...feeCategories.flatMap(({ key }) => [comparison.oldEvaluation[key], comparison.newEvaluation[key]]),
  )

  return (
    <section className="panel financial-section" aria-labelledby="fee-breakdown-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Rule-level impact</p>
          <h2 id="fee-breakdown-title">Fee Breakdown</h2>
        </div>
        <div>
          <p>Old and new fees on the same scale</p>
          <div className="chart-legend" aria-hidden="true">
            <span><i className="old" />Old</span>
            <span><i className="new" />New</span>
          </div>
        </div>
      </div>
      <div className="fee-list">
        {feeCategories.map(({ key, label }) => {
          const oldCents = comparison.oldEvaluation[key]
          const newCents = comparison.newEvaluation[key]
          const deltaCents = comparison.deltaByCategoryCents[key]
          const direction = getCostDirection(deltaCents)

          return (
            <article className="fee-row" aria-label={label} key={key}>
              <h3 className="fee-name">{label}</h3>
              <dl className="fee-values">
                <div><dt>Old</dt><dd className="fee-amount">{formatUsdCents(oldCents)}</dd></div>
                <div><dt>New</dt><dd className="fee-amount">{formatUsdCents(newCents)}</dd></div>
                <div>
                  <dt>Delta</dt>
                  <dd className={`delta-value ${direction.kind}`}>
                    {formatDeltaCents(deltaCents)}
                    <span className="sr-only"> {direction.label}</span>
                  </dd>
                </div>
              </dl>
              <div className="fee-bars" aria-hidden="true">
                <div className="bar-track">
                  <span className="bar-fill old" style={{ width: `${scale === 0 ? 0 : (oldCents / scale) * 100}%` }} />
                </div>
                <div className="bar-track">
                  <span className="bar-fill new" style={{ width: `${scale === 0 ? 0 : (newCents / scale) * 100}%` }} />
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
