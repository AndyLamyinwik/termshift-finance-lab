import { calendarDaysBetween } from '../../engine/dates'
import type { Scenario } from '../../models'
import type { Witness } from '../../search'
import { CalculationDetails } from '../dashboard/CalculationDetails'
import { FeeBreakdown, FinancialSummary } from '../dashboard/ComparisonPanels'
import { formatDeltaCents, formatUsdCents, getCostDirection } from '../dashboard/format'
import type { SearchSnapshot, WorkspaceController } from '../workspace/types'

function purchaseTotal(scenario: Scenario): string {
  const cents = scenario.transactions.reduce((total, transaction) => total + BigInt(transaction.amountCents), 0n)
  if (cents <= BigInt(Number.MAX_SAFE_INTEGER)) return formatUsdCents(Number(cents))
  // A valid scenario can contain individually safe amounts whose sum cannot use the safe-number formatter.
  return `Total exceeds the safe USD display range (${cents} cents).`
}

function paymentDelaySummary(scenario: Scenario): string {
  if (scenario.paymentEvents.length === 0) return 'No payment events'
  return scenario.paymentEvents.map((payment) => {
    const days = calendarDaysBetween(payment.dueOn, payment.paidOn)
    return `${payment.id}: ${days === 0 ? 'on time' : days < 0 ? `${-days} days early` : `${days} days late`}`
  }).join('; ')
}

function WitnessChoice({ witness, selected, onSelect }: {
  witness: Witness
  selected: boolean
  onSelect(): void
}) {
  const direction = getCostDirection(witness.comparison.deltaCents)
  return (
    <li>
      <button type="button" className={`hunter-witness-choice ${selected ? 'selected' : ''}`}
        aria-label={witness.candidateId} aria-pressed={selected}
        aria-describedby={`hunter-${witness.candidateId}-delta hunter-${witness.candidateId}-source`} onClick={onSelect}>
        <span className="hunter-witness-title"><strong>{witness.candidateId}</strong>
          <span id={`hunter-${witness.candidateId}-delta`} className={`delta-value ${direction.kind}`}>{formatDeltaCents(witness.comparison.deltaCents)}</span></span>
        <span id={`hunter-${witness.candidateId}-source`} className="hunter-witness-source">Source: {witness.source} · {direction.label}</span>
        <span>Purchase Count: {witness.scenario.transactions.length}</span>
        <span>Purchase Total: {purchaseTotal(witness.scenario)}</span>
        <span>Payment Delay Summary: {paymentDelaySummary(witness.scenario)}</span>
      </button>
    </li>
  )
}

function WitnessScenario({ witness }: { witness: Witness }) {
  const scenario = witness.scenario
  return (
    <section className="panel hunter-scenario" aria-labelledby="hunter-witness-scenario-title">
      <div className="section-heading">
        <div><p className="eyebrow">Actual retained scenario</p><h3 id="hunter-witness-scenario-title">Witness Scenario</h3></div>
      </div>
      <dl className="hunter-context-grid">
        <div><dt>Scenario ID</dt><dd>{scenario.id}</dd></div>
        <div><dt>Billing Month</dt><dd>{scenario.billingMonth}</dd></div>
        <div><dt>Purchase Count</dt><dd>{scenario.transactions.length}</dd></div>
        <div><dt>Purchase Total</dt><dd>{purchaseTotal(scenario)}</dd></div>
      </dl>
      <h4>Transactions</h4>
      {scenario.transactions.length > 0 ? <ul className="hunter-event-list">
        {scenario.transactions.map((transaction) => <li key={transaction.id}>
          <strong>{transaction.id}</strong>
          <dl className="hunter-event-values">
            <div><dt>Occurred On</dt><dd>{transaction.occurredOn}</dd></div>
            <div><dt>Amount</dt><dd>{formatUsdCents(transaction.amountCents)}</dd></div>
            <div><dt>Kind</dt><dd>{transaction.kind}</dd></div>
          </dl>
        </li>)}
      </ul> : <p>No purchases in this witness.</p>}
      <h4>Payment Events</h4>
      {scenario.paymentEvents.length > 0 ? <ul className="hunter-event-list">
        {scenario.paymentEvents.map((payment) => <li key={payment.id}>
          <strong>{payment.id}</strong>
          <dl className="hunter-event-values">
            <div><dt>Due On</dt><dd>{payment.dueOn}</dd></div>
            <div><dt>Paid On</dt><dd>{payment.paidOn}</dd></div>
            <div><dt>Amount</dt><dd>{formatUsdCents(payment.amountCents)}</dd></div>
            <div><dt>Calendar Day Delay</dt><dd>{calendarDaysBetween(payment.dueOn, payment.paidOn)}</dd></div>
          </dl>
        </li>)}
      </ul> : <p>No payment events in this witness.</p>}
    </section>
  )
}

function SearchEvidence({ witness, snapshot }: { witness: Witness; snapshot: SearchSnapshot }) {
  const options = snapshot.searchOptions
  return (
    <section className="panel hunter-evidence" aria-labelledby="hunter-evidence-title">
      <h3 id="hunter-evidence-title">Search Evidence</h3>
      <dl className="hunter-context-grid">
        <div><dt>Candidate ID</dt><dd>{witness.candidateId}</dd></div>
        <div><dt>Sequence</dt><dd>{witness.sequence}</dd></div>
        <div><dt>Source</dt><dd>{witness.source}</dd></div>
        <div><dt>Seed</dt><dd>{options.seed}</dd></div>
        <div><dt>Purchase Count Range</dt><dd>{options.purchaseCountMin}–{options.purchaseCountMax}</dd></div>
        <div><dt>Purchase Amount Range</dt><dd>{formatUsdCents(options.purchaseAmountCentsMin)}–{formatUsdCents(options.purchaseAmountCentsMax)}</dd></div>
        <div><dt>Late Days Range</dt><dd>{options.lateDaysMin}–{options.lateDaysMax}</dd></div>
        <div><dt>Evaluation Budget</dt><dd>{options.maxEvaluations}</dd></div>
        <div><dt>Result Limit</dt><dd>{options.maxResults}</dd></div>
      </dl>
      <p>Comparison uses the applied contract snapshots saved with this search.</p>
    </section>
  )
}

export function WitnessExplorer({ workspace, snapshot }: {
  workspace: WorkspaceController
  snapshot: SearchSnapshot
}) {
  const witnesses = snapshot.searchReport.witnesses
  const selected = witnesses.find((witness) => witness.candidateId === snapshot.selectedWitnessId)
  if (witnesses.length === 0) return null
  return (
    <>
      <section className="panel hunter-witnesses" aria-labelledby="hunter-witness-list-title">
        <div className="section-heading">
          <div><p className="eyebrow">Retained counterexamples</p><h2 id="hunter-witness-list-title">Witness List</h2></div>
          <p>Select a witness to inspect its scenario and recorded comparison.</p>
        </div>
        <ul className="hunter-witness-list">
          {witnesses.map((witness) => <WitnessChoice key={witness.candidateId} witness={witness}
            selected={witness.candidateId === snapshot.selectedWitnessId}
            onSelect={() => workspace.selectWitness(witness.candidateId)} />)}
        </ul>
      </section>
      {selected && <section className="hunter-selected" aria-labelledby="hunter-selected-title">
        <div className="section-heading">
          <div><p className="eyebrow">Financial impact · exact recorded results</p><h2 id="hunter-selected-title">Selected Witness</h2></div>
          <p>{selected.candidateId} · {selected.source}</p>
        </div>
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          Selected witness {selected.candidateId}. Cost difference {formatDeltaCents(selected.comparison.deltaCents)}.
          {' '}{getCostDirection(selected.comparison.deltaCents).label}.
        </p>
        <FinancialSummary comparison={selected.comparison} oldModified={workspace.oldModified} newModified={workspace.newModified} />
        <FeeBreakdown comparison={selected.comparison} />
        <div className="hunter-detail-grid">
          <WitnessScenario witness={selected} />
          <SearchEvidence witness={selected} snapshot={snapshot} />
        </div>
        <CalculationDetails key={selected.candidateId} comparison={selected.comparison} />
      </section>}
    </>
  )
}
