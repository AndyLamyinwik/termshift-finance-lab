import type { ReactNode } from 'react'
import type { ImpactProof, ImpactProofVerification } from '../../proof'
import { CalculationDetails } from '../dashboard/CalculationDetails'
import { BeforeAfterComparison } from './BeforeAfterComparison'
import { ProofOverview } from './ProofOverview'
import { ReductionTimeline } from './ReductionTimeline'

export function ProofIssues({ issues }: {
  issues: ReadonlyArray<{ code: string; path: ReadonlyArray<string | number>; message: string }>
}) {
  return <ul className="error-list">{issues.map((issue, index) => <li key={`${issue.code}-${index}`}>
    <strong>{issue.code}</strong> · {issue.path.length > 0 ? issue.path.join('.') : '(root)'} · {issue.message}
  </li>)}</ul>
}

function FinancialExplanation({ proof }: { proof: ImpactProof }) {
  return (
    <section className="proof-explanation" aria-labelledby="proof-explanation-title">
      <div className="section-heading"><div><p className="eyebrow">Existing engine traces</p><h2 id="proof-explanation-title">Financial Explanation</h2></div></div>
      <p>Calculation Details below shows the minimized witness’s recorded fee decisions and charges for both saved contracts.</p>
      <CalculationDetails comparison={proof.minimizedComparison} />
      <dl className="proof-context-grid">
        <div><dt>Money Unit</dt><dd>{proof.calculationPolicy.moneyUnit}</dd></div>
        <div><dt>Rate Unit</dt><dd>{proof.calculationPolicy.rateUnit}</dd></div>
        <div><dt>Rounding</dt><dd>{proof.calculationPolicy.rounding}</dd></div>
        <div><dt>Dates</dt><dd>{proof.calculationPolicy.dates}</dd></div>
        <div><dt>Cost Difference</dt><dd>{proof.calculationPolicy.delta}</dd></div>
        <div><dt>Effective Date</dt><dd>{proof.calculationPolicy.effectiveDate}</dd></div>
      </dl>
    </section>
  )
}

export function ProofPresentation({ proof, verification, experiment, imported = false, actions }: {
  proof: ImpactProof
  verification: ImpactProofVerification
  experiment?: { id: string; name: string }
  imported?: boolean
  actions?: ReactNode
}) {
  return <>
    <ProofOverview proof={proof} verification={verification} imported={imported}
      {...(experiment ? { experiment } : {})} />
    {actions}
    <BeforeAfterComparison proof={proof} />
    <ReductionTimeline key={`${proof.witnessSource.candidateId}-${proof.minimizationBudget.maxChecks}-${proof.minimizationBudget.checksPerformed}`} proof={proof} />
    <FinancialExplanation proof={proof} />
    <section className="panel proof-limitations" aria-labelledby="proof-limitations-title">
      <h2 id="proof-limitations-title">Limitations</h2>
      <ul>{proof.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>
      <p>This viewer operates entirely in page memory. Reloading clears evidence. JSON preserves the complete proof for independent verification; Markdown is a human-readable report.</p>
    </section>
  </>
}
