import type { CalculationTrace, Comparison, Evaluation } from '../../engine'
import { formatUsdCents } from './format'

function TraceValue({ label, value }: { label: string; value: string | number }) {
  return <div className="trace-value"><dt>{label}</dt><dd>{value}</dd></div>
}

function TraceRecord({ trace }: { trace: CalculationTrace }) {
  if (trace.ruleType === 'monthlyFee') {
    const isCount = trace.waiverKind === 'minTransactionCount'
    return (
      <>
        <h4 className="trace-title">Monthly fee</h4>
        <dl className="trace-values">
          <TraceValue label="Original fee" value={formatUsdCents(trace.originalFeeCents)} />
          <TraceValue label="Waiver condition" value={isCount ? 'Minimum purchase count' : 'Minimum monthly purchase total'} />
          <TraceValue label="Threshold" value={isCount ? trace.threshold : formatUsdCents(trace.threshold)} />
          <TraceValue
            label="Actual value"
            value={trace.waiverKind === 'minTransactionCount'
              ? trace.actualTransactionCount
              : formatUsdCents(trace.actualPurchaseTotalCents)}
          />
          <TraceValue label="Waived" value={trace.waived ? 'Yes' : 'No'} />
          <TraceValue label="Charged" value={formatUsdCents(trace.chargedCents)} />
        </dl>
      </>
    )
  }

  if (trace.ruleType === 'transactionFee') {
    return (
      <>
        <h4 className="trace-title">Purchase · {trace.transactionId}</h4>
        <dl className="trace-values">
          <TraceValue label="Transaction ID" value={trace.transactionId} />
          <TraceValue label="Amount" value={formatUsdCents(trace.amountCents)} />
          <TraceValue label="Fixed fee" value={formatUsdCents(trace.fixedCents)} />
          <TraceValue label="Rate" value={`${trace.rateBps} bps`} />
          <TraceValue label="Rounded proportional fee" value={formatUsdCents(trace.variableFeeCents)} />
          <TraceValue label="Charged" value={formatUsdCents(trace.chargedCents)} />
        </dl>
      </>
    )
  }

  return (
    <>
      <h4 className="trace-title">Payment · {trace.paymentEventId}</h4>
      <dl className="trace-values">
        <TraceValue label="Payment ID" value={trace.paymentEventId} />
        <TraceValue label="Due date" value={trace.dueOn} />
        <TraceValue label="Paid date" value={trace.paidOn} />
        <TraceValue label="Original fee" value={formatUsdCents(trace.originalFeeCents)} />
        <TraceValue label="Late days" value={trace.lateDays} />
        <TraceValue label="Grace days" value={trace.graceDays} />
        <TraceValue label="Grace exceeded" value={trace.graceExceeded ? 'Yes' : 'No'} />
        <TraceValue label="Charged" value={formatUsdCents(trace.chargedCents)} />
      </dl>
    </>
  )
}

function TraceSection({ evaluation, label }: { evaluation: Evaluation; label: string }) {
  return (
    <section className="trace-section" aria-label={`${label} calculation trace`}>
      <h3>{label}</h3>
      <p className="contract-meta">Version {evaluation.contractVersion} · {evaluation.contractId}</p>
      {evaluation.trace.length > 0 ? (
        <ol className="trace-list">
          {evaluation.trace.map((trace, index) => (
            <li className="trace-item" key={`${trace.ruleType}-${index}`}>
              <TraceRecord trace={trace} />
            </li>
          ))}
        </ol>
      ) : <p>No applicable fee events in this scenario.</p>}
    </section>
  )
}

export function CalculationDetails({ comparison }: { comparison: Comparison }) {
  return (
    <details className="panel calculation-details">
      <summary>Calculation Details</summary>
      <p>Inspect the calculation engine’s recorded inputs, decisions and charges.</p>
      <div className="trace-columns">
        <TraceSection evaluation={comparison.oldEvaluation} label="Old Contract" />
        <TraceSection evaluation={comparison.newEvaluation} label="New Contract" />
      </div>
    </details>
  )
}
