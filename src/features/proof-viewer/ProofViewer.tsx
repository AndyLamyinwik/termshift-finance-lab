import { formatDeltaCents } from '../dashboard/format'
import { EvidenceActions, ImportedEvidence } from '../portable-evidence/EvidenceActions'
import { ExperimentSelector, WorkspaceNotice } from '../workspace/WorkspacePresentation'
import type { WorkspaceController } from '../workspace/types'
import { ProofIssues, ProofPresentation } from './ProofPresentation'

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

function CurrentWorkspaceProof({ workspace }: { workspace: WorkspaceController }) {
  const snapshot = workspace.searchSnapshot
  const witness = snapshot?.searchReport.witnesses.find((item) => item.candidateId === snapshot.selectedWitnessId)
  const state = workspace.proofState
  return (
    <section className="workspace-evidence" aria-labelledby="workspace-evidence-title">
      <div className="section-heading"><div><p className="eyebrow">Applied contracts and selected witness</p><h2 id="workspace-evidence-title">Current Workspace Proof</h2></div></div>
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
      {state.status === 'success' && <ProofPresentation proof={state.proof} verification={state.verification} experiment={workspace.selectedExperiment}
        actions={<div className="editor-actions proof-actions"><button className="button-secondary" type="button" onClick={workspace.verifyProofAgain}>Verify Again</button>
          <button className="button-secondary" type="button" onClick={workspace.clearProof}>Clear Proof</button></div>
        } />}
    </section>
  )
}

export default function ProofViewer({ workspace }: { workspace: WorkspaceController }) {
  return (
    <main id="proof-of-impact" className="dashboard-main proof-main" tabIndex={-1}>
      <div className="dashboard-titlebar">
        <div><p className="eyebrow">Financial Contract Counterexample Lab</p><h1>Proof of Impact</h1>
          <p className="dashboard-intro">Reduce a selected counterexample, verify its evidence, or independently verify a local Proof JSON file.</p></div>
        <span className="status-pill">Computed locally</span>
      </div>
      <EvidenceActions workspace={workspace} />
      {workspace.evidenceView === 'imported' ? <ImportedEvidence workspace={workspace} /> : <CurrentWorkspaceProof workspace={workspace} />}
    </main>
  )
}
