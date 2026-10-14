import { ProofIssues, ProofPresentation } from '../proof-viewer/ProofPresentation'
import type { WorkspaceController } from '../workspace/types'

export function EvidenceActions({ workspace }: { workspace: WorkspaceController }) {
  const imported = workspace.importedProofState
  const selected = workspace.evidenceView === 'workspace' ? workspace.proofState : imported
  const canVerifyImported = imported.status === 'success'
    || (imported.status === 'failure' && imported.proof !== null)
  return (
    <section className="panel evidence-actions" aria-labelledby="evidence-actions-title">
      <div className="section-heading"><div><p className="eyebrow">Portable local evidence</p><h2 id="evidence-actions-title">Evidence Actions</h2></div></div>
      <div className="evidence-view-switch" role="group" aria-label="Evidence source">
        <button className="button-secondary" type="button" aria-pressed={workspace.evidenceView === 'workspace'}
          onClick={() => workspace.setEvidenceView('workspace')}>Current Workspace Proof</button>
        <button className="button-secondary" type="button" aria-pressed={workspace.evidenceView === 'imported'}
          onClick={() => workspace.setEvidenceView('imported')}>Imported Proof</button>
      </div>
      <p>JSON can be independently reverified. Markdown makes the report convenient to read; it does not replace complete Proof JSON.</p>
      <p>Downloads use the verified proof in the selected evidence view. Import reads a local file without uploading it.</p>
      <div className="editor-actions evidence-downloads">
        <button className="button-primary" type="button" disabled={selected.status !== 'success'} onClick={workspace.downloadProofJson}>Download JSON</button>
        <button className="button-secondary" type="button" disabled={selected.status !== 'success'} onClick={workspace.downloadMarkdownReport}>Download Markdown</button>
      </div>
      <div className="editor-field evidence-file-field">
        <label htmlFor="evidence-import-file">Import Proof JSON</label>
        <input id="evidence-import-file" type="file" accept=".json,application/json" aria-describedby="evidence-import-hint"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0]
            event.currentTarget.value = ''
            void workspace.importProofFile(file)
          }} />
        <p id="evidence-import-hint" className="editor-field-hint">Maximum 5 MiB. Files must contain supported Proof JSON and pass the formal schema and independent financial verification.</p>
      </div>
      <div className="editor-actions evidence-import-actions">
        <button className="button-secondary" type="button" disabled={!canVerifyImported} onClick={workspace.verifyImportedProofAgain}>Verify Imported Proof Again</button>
        <button className="button-secondary" type="button" disabled={imported.status === 'idle'} onClick={workspace.clearImportedProof}>Clear Imported Proof</button>
      </div>
      <p>Verified confirms calculation consistency. It does not authenticate the file’s author or provide a digital signature.</p>
      {workspace.exportIssues.length > 0 && <div className="error-panel evidence-export-error" role="alert">
        <h3>Export failed</h3><ProofIssues issues={workspace.exportIssues} />
      </div>}
    </section>
  )
}

export function ImportedEvidence({ workspace }: { workspace: WorkspaceController }) {
  const state = workspace.importedProofState
  return (
    <section className="imported-evidence" aria-labelledby="imported-evidence-title">
      <div className="section-heading"><div><p className="eyebrow">Independent saved proof</p><h2 id="imported-evidence-title">Imported Evidence</h2></div></div>
      <p>This evidence uses its own embedded contracts and witness. It does not change the current workspace or its search snapshot.</p>
      {state.status !== 'idle' && state.fileName !== null && <p className="evidence-file-name"><strong>Local file:</strong> {state.fileName}</p>}
      {state.status === 'idle' && <p className="proof-empty-note" role="status" aria-live="polite">Verification Status: No imported proof</p>}
      {state.status === 'reading' && <p className="proof-empty-note" role="status" aria-live="polite">Reading local file</p>}
      {state.status === 'failure' && <section className="panel error-panel" role="alert">
        <h3>{state.phase === 'verification' ? 'Verification failed' : 'Import failed'}</h3>
        <p>Verification Status: {state.phase === 'verification' ? 'Verification failed' : 'Import failed'}</p>
        <ProofIssues issues={state.issues} />
      </section>}
      {state.status === 'success' && <ProofPresentation proof={state.proof} verification={state.verification} imported />}
    </section>
  )
}
