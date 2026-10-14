import type { MinimizationIssue } from '../../minimizer'
import type { ImpactProof } from '../../proof'
import { CalculationDetails } from '../dashboard/CalculationDetails'
import { formatDeltaCents } from '../dashboard/format'
import { ExperimentSelector, WorkspaceNotice } from '../workspace/WorkspacePresentation'
import type { WorkspaceController } from '../workspace/types'
import { BeforeAfterComparison } from './BeforeAfterComparison'
import { ProofOverview } from './ProofOverview'
import { ReductionTimeline } from './ReductionTimeline'

function ProofIssues({ issues }: { issues: MinimizationIssue[] }) {
  return <ul className="error-list">{issues.map((issue, index) => <li key={`${issue.code}-${index}`}>
    <strong>{issue.code}</strong> · {issue.path.length > 0 ? issue.path.join('.') : '(root)'} · {issue.message}
  </li>)}</ul>
}

function MinimizationControls({ workspace, hasWitness }: { workspace: WorkspaceController; hasWitness: boolean }) {
  const issues = workspace.minimizationIssues
  return (
    <form className="panel proof-controls" aria-label="Minimization Controls" noValidate onSubmit={(event) => {
      event.preventDefault()
      if (hasWitness) workspace.generateProof()
    }}>
      <div className="section-heading"><div><p className="eyebrow">Bounded local reduction</p><h2>Minimization Controls</h2></div></div>
      <div className="editor-field proof-budget-field">
        <label htmlFor="proof-maxChecks">Max Checks</label>
        <input id="proof-maxChecks" type="text" inputMode="numeric" value={workspace.minimizationOptionsDraft.maxChecks}
          aria-invalid={issues.length > 0 ? true : undefined}
          aria-describedby={`proof-maxChecks-hint${issues.length > 0 ? ' proof-maxChecks-error' : ''}`}
          onChange={(event) => workspace.updateMinimizationOptionsDraft(event.target.value)} />
        <p id="proof-maxChecks-hint" className="editor-field-hint">1–300 whole-number minimization checks. Default: 200.</p>
        {issues.length > 0 && <ul id="proof-maxChecks-error" className="field-error">{issues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.message}</li>)}</ul>}
      </div>
      {issues.length > 0 && <p role="alert">Unable to generate proof. Correct the minimization options.</p>}
      <div className="editor-actions">
        <button type="submit" className="button-primary" disabled={!hasWitness}>Generate Proof</button>
        <p>Runs the existing minimizer, then independently verifies its evidence. No proof is generated until you submit.</p>
      </div>
    </form>
  )
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

export default function ProofViewer({ workspace }: { workspace: WorkspaceController }) {
  const snapshot = workspace.searchSnapshot
  const witness = snapshot?.searchReport.witnesses.find((item) => item.candidateId === snapshot.selectedWitnessId)
  const state = workspace.proofState
  return (
    <main id="proof-of-impact" className="dashboard-main proof-main" tabIndex={-1}>
      <div className="dashboard-titlebar">
        <div><p className="eyebrow">Financial Contract Counterexample Lab</p><h1>Proof of Impact</h1>
          <p className="dashboard-intro">Reduce a selected counterexample and verify the saved financial evidence using the existing local engine.</p></div>
        <span className="status-pill">Computed locally</span>
      </div>
      <section className="panel experiment-section" aria-labelledby="experiment-title"><ExperimentSelector workspace={workspace} /></section>
      <WorkspaceNotice workspace={workspace} />
      {witness && snapshot ? <section className="panel proof-selected" aria-labelledby="proof-selected-title">
        <div className="section-heading"><div><p className="eyebrow">Current search snapshot</p><h2 id="proof-selected-title">Selected Witness</h2></div></div>
        <dl className="proof-context-grid">
          <div><dt>Witness Candidate ID</dt><dd>{witness.candidateId}</dd></div>
          <div><dt>Witness Source</dt><dd>{witness.source}</dd></div>
          <div><dt>Search Seed</dt><dd>{snapshot.searchOptions.seed}</dd></div>
          <div><dt>Old Contract ID</dt><dd>{snapshot.oldContract.id}</dd></div>
          <div><dt>New Contract ID</dt><dd>{snapshot.newContract.id}</dd></div>
          <div><dt>Recorded Cost Difference</dt><dd>{formatDeltaCents(witness.comparison.deltaCents)}</dd></div>
        </dl>
        <p>Proof uses the applied contract snapshots and witness saved with this search.</p>
        {workspace.hasUnappliedChanges && <p className="hunter-pending-note">Unapplied Financial Diff drafts are excluded. Proof uses the last applied search snapshot.</p>}
      </section> : <section className="panel proof-empty" aria-label="Proof empty state">
        <h2>Select a counterexample</h2>
        <p>No witness selected. Run a counterexample search and select a witness first.</p>
        <button className="button-secondary" type="button" onClick={() => workspace.setActiveView('counterexample-hunter')}>Go to Counterexample Hunter</button>
      </section>}
      <MinimizationControls workspace={workspace} hasWitness={Boolean(witness && snapshot)} />
      {state.status === 'idle' && <p className="proof-empty-note" role="status" aria-live="polite">Verification Status: Not generated</p>}
      {state.status === 'failure' && <section className="panel error-panel" role="alert">
        <h2>{state.phase === 'verification' ? 'Verification failed' : 'Unable to generate proof'}</h2>
        <p>Verification Status: {state.phase === 'verification' ? 'Verification failed' : 'Not generated'}</p>
        <ProofIssues issues={state.issues} />
        {state.proof && <button className="button-secondary" type="button" onClick={workspace.verifyProofAgain}>Verify Again</button>}
      </section>}
      {state.status === 'success' && <>
        <ProofOverview proof={state.proof} verification={state.verification} experiment={workspace.selectedExperiment} />
        <div className="editor-actions proof-actions"><button className="button-secondary" type="button" onClick={workspace.verifyProofAgain}>Verify Again</button>
          <button className="button-secondary" type="button" onClick={workspace.clearProof}>Clear Proof</button></div>
        <BeforeAfterComparison proof={state.proof} />
        <ReductionTimeline key={`${state.proof.witnessSource.candidateId}-${state.proof.minimizationBudget.maxChecks}-${state.proof.minimizationBudget.checksPerformed}`} proof={state.proof} />
        <FinancialExplanation proof={state.proof} />
        <section className="panel proof-limitations" aria-labelledby="proof-limitations-title">
          <h2 id="proof-limitations-title">Limitations</h2>
          <ul>{state.proof.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>
          <p>This viewer operates entirely in page memory. Reloading clears evidence. Downloads and proof import are reserved for Stage 5C-2.</p>
        </section>
      </>}
    </main>
  )
}
