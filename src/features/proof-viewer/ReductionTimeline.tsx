import { useState } from 'react'
import type { ImpactProof } from '../../proof'
import { formatDeltaCents } from '../dashboard/format'
import { RecordedComparison } from './BeforeAfterComparison'
import { paymentDelayLabel, purchaseTotalLabel, totalLateDays } from './scenarioPresentation'

export function ReductionTimeline({ proof }: { proof: ImpactProof }) {
  const [visibleCount, setVisibleCount] = useState(10)
  const steps = proof.reductionSteps
  return (
    <section className="panel proof-timeline" aria-labelledby="proof-timeline-title">
      <div className="section-heading"><div><p className="eyebrow">Accepted modifications only</p><h2 id="proof-timeline-title">Reduction Timeline</h2></div></div>
      <p>This timeline contains accepted reductions from the proof. Rejected attempts are not reduction steps.</p>
      {steps.length === 0 ? <p>No accepted reduction steps under the selected strategy and budget.</p> : <>
        <p>Showing {Math.min(visibleCount, steps.length)} of {steps.length} accepted reduction steps.</p>
        <ol className="proof-step-list">
          {steps.slice(0, visibleCount).map((step, index) => {
            const previousComparison = index === 0 ? proof.originalComparison : steps[index - 1]!.comparison
            return (
              <li key={index}>
                <details className="proof-step">
                  <summary>Step {index + 1}: {step.type}</summary>
                  <p><strong>Reason:</strong> {step.reason}</p>
                  <dl className="proof-context-grid">
                    <div><dt>Step Number</dt><dd>{index + 1}</dd></div>
                    <div><dt>Step Type</dt><dd>{step.type}</dd></div>
                    <div><dt>Before Purchase Count</dt><dd>{step.before.transactions.length}</dd></div>
                    <div><dt>After Purchase Count</dt><dd>{step.after.transactions.length}</dd></div>
                    <div><dt>Before Purchase Total</dt><dd>{purchaseTotalLabel(step.before)}</dd></div>
                    <div><dt>After Purchase Total</dt><dd>{purchaseTotalLabel(step.after)}</dd></div>
                    <div><dt>Before Total Late Days</dt><dd>{totalLateDays(step.before)}</dd></div>
                    <div><dt>After Total Late Days</dt><dd>{totalLateDays(step.after)}</dd></div>
                    <div className="proof-wide-value"><dt>Before Payment Delay</dt><dd>{paymentDelayLabel(step.before)}</dd></div>
                    <div className="proof-wide-value"><dt>After Payment Delay</dt><dd>{paymentDelayLabel(step.after)}</dd></div>
                    <div><dt>Before Delta</dt><dd>{formatDeltaCents(previousComparison.deltaCents)}</dd></div>
                    <div><dt>After Delta</dt><dd>{formatDeltaCents(step.comparison.deltaCents)}</dd></div>
                  </dl>
                  <section aria-label={`Step ${index + 1} Accepted Comparison`}>
                    <h3>Accepted Comparison</h3>
                    <RecordedComparison comparison={step.comparison} />
                  </section>
                </details>
              </li>
            )
          })}
        </ol>
        {visibleCount < steps.length && <button className="button-secondary" type="button" onClick={() => setVisibleCount((count) => Math.min(count + 10, steps.length))}>
          Show More
        </button>}
      </>}
    </section>
  )
}
