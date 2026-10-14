import type { Comparison } from '../../engine'
import type { Scenario } from '../../models'
import type { ImpactProof } from '../../proof'
import { formatDeltaCents, formatUsdCents, getCostDirection } from '../dashboard/format'
import { paymentDelayLabel, purchaseTotalLabel } from './scenarioPresentation'

export function RecordedComparison({ comparison }: { comparison: Comparison }) {
  const direction = getCostDirection(comparison.deltaCents)
  return (
    <dl className="proof-comparison-values">
      <div><dt>Old Contract Total</dt><dd>{formatUsdCents(comparison.oldEvaluation.totalCents)}</dd></div>
      <div><dt>New Contract Total</dt><dd>{formatUsdCents(comparison.newEvaluation.totalCents)}</dd></div>
      <div><dt>Signed Delta</dt><dd className={`delta-value ${direction.kind}`}>{formatDeltaCents(comparison.deltaCents)}<span className="sr-only"> {direction.label}</span></dd></div>
    </dl>
  )
}

function WitnessPanel({ label, scenario, comparison }: { label: string; scenario: Scenario; comparison: Comparison }) {
  return (
    <article className="panel proof-witness-panel" aria-label={label}>
      <p className="eyebrow">Recorded scenario and comparison</p><h3>{label}</h3>
      <dl className="proof-context-grid">
        <div><dt>Scenario ID</dt><dd>{scenario.id}</dd></div>
        <div><dt>Billing Month</dt><dd>{scenario.billingMonth}</dd></div>
        <div><dt>Purchase Count</dt><dd>{scenario.transactions.length}</dd></div>
        <div><dt>Purchase Total</dt><dd>{purchaseTotalLabel(scenario)}</dd></div>
        <div><dt>Payment Event Count</dt><dd>{scenario.paymentEvents.length}</dd></div>
        <div className="proof-wide-value"><dt>Payment Delay Summary</dt><dd>{paymentDelayLabel(scenario)}</dd></div>
      </dl>
      <RecordedComparison comparison={comparison} />
    </article>
  )
}

export function BeforeAfterComparison({ proof }: { proof: ImpactProof }) {
  return (
    <section aria-labelledby="proof-before-after-title" className="proof-before-after">
      <div className="section-heading"><div><p className="eyebrow">Preserved direction, simpler scenario</p><h2 id="proof-before-after-title">Before / After Comparison</h2></div></div>
      <p>Accepted reductions preserve a nonzero cost difference and its direction. The difference amount may change.</p>
      <div className="proof-comparison-grid">
        <WitnessPanel label="Original Witness" scenario={proof.originalScenario} comparison={proof.originalComparison} />
        <WitnessPanel label="Minimized Witness" scenario={proof.minimizedScenario} comparison={proof.minimizedComparison} />
      </div>
    </section>
  )
}
