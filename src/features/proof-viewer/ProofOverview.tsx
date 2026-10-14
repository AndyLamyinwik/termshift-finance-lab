import type { ImpactProof, ImpactProofVerification } from '../../proof'
import { formatDeltaCents } from '../dashboard/format'

export function ProofOverview({ proof, verification, experiment }: {
  proof: ImpactProof
  verification: ImpactProofVerification
  experiment: { id: string; name: string }
}) {
  const budget = proof.minimizationBudget
  return (
    <section className="panel proof-overview" aria-labelledby="proof-overview-title">
      <div className="section-heading"><div><p className="eyebrow">Recomputed evidence</p><h2 id="proof-overview-title">Verification Overview</h2></div></div>
      <dl className="proof-context-grid">
        <div><dt>Verification Status</dt><dd className="proof-verified">Verified</dd></div>
        <div><dt>Verified Comparisons</dt><dd>{verification.verifiedComparisons}</dd></div>
        <div><dt>Proof Schema Version</dt><dd>{proof.proofSchemaVersion}</dd></div>
        <div><dt>Engine Version</dt><dd>{proof.engineVersion}</dd></div>
        <div><dt>Minimizer Version</dt><dd>{proof.minimizerVersion}</dd></div>
        <div><dt>Experiment</dt><dd>{experiment.name}</dd></div>
        <div><dt>Experiment ID</dt><dd>{experiment.id}</dd></div>
        <div><dt>Old Contract ID</dt><dd>{proof.oldContract.id}</dd></div>
        <div><dt>New Contract ID</dt><dd>{proof.newContract.id}</dd></div>
        <div><dt>Witness Candidate ID</dt><dd>{proof.witnessSource.candidateId}</dd></div>
        <div><dt>Witness Source</dt><dd>{proof.witnessSource.source}</dd></div>
        <div><dt>Search Seed</dt><dd>{proof.searchOptions.seed}</dd></div>
        <div><dt>Original Cost Difference</dt><dd>{formatDeltaCents(proof.originalComparison.deltaCents)}</dd></div>
        <div><dt>Minimized Cost Difference</dt><dd>{formatDeltaCents(proof.minimizedComparison.deltaCents)}</dd></div>
        <div><dt>Checks Performed</dt><dd>{budget.checksPerformed}</dd></div>
        <div><dt>Max Checks</dt><dd>{budget.maxChecks}</dd></div>
        <div><dt>Budget Exhausted</dt><dd>{budget.budgetExhausted ? 'Yes' : 'No'}</dd></div>
        <div><dt>Termination Reason</dt><dd>{budget.terminationReason}</dd></div>
      </dl>
      <p>Verification rechecks arithmetic, scenarios and reduction constraints against the saved contracts.
        Verified describes this evidence’s calculation consistency.</p>
      <p>Strategy completion means the implemented reduction strategy finished within this budget. It does not prove a globally minimal counterexample.</p>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">Proof verification passed. {verification.verifiedComparisons} financial comparisons verified.</p>
    </section>
  )
}
