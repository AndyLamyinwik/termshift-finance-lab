import { useEffect, useMemo, useRef, useState } from 'react'
import { compareContracts } from '../../engine'
import { experiments } from '../../scenarios'
import type { ExperimentFixture } from '../../scenarios'
import { searchCounterexamples } from '../../search'
import { createImpactProof, verifyImpactProof } from '../../proof'
import { contractToDraft, parseContractDraft } from '../financial-diff/drafts'
import type { ContractDraft } from '../financial-diff/drafts'
import { createSearchBase, createSearchOptionsDraft, parseSearchOptionsDraft } from '../hunter/options'
import type { SearchOptionsDraft } from '../hunter/options'
import { createMinimizationOptionsDraft, parseMinimizationOptionsDraft } from '../proof-viewer/options'
import {
  downloadTextFile, prepareMarkdownExport, prepareProofJsonExport, readAndVerifyProofFile,
} from '../portable-evidence/portable'
import type { PortableIssue, PortableResult, TextDownload } from '../portable-evidence/portable'
import type { ContractSide, EvidenceView, ImportedProofState, WorkspaceController, WorkspaceView } from './types'

type WorkspaceState = Pick<WorkspaceController,
  'selectedExperimentId' | 'workingOldContract' | 'workingNewContract' | 'activeView'
  | 'draftOldContract' | 'draftNewContract' | 'draftIssues' | 'applyStatus'
  | 'searchDraft' | 'searchIssues' | 'searchFailure' | 'searchSnapshot'
  | 'proofState' | 'minimizationOptionsDraft' | 'minimizationIssues'> & {
  appliedOldDraft: ContractDraft
  appliedNewDraft: ContractDraft
}

function initialState(experiment: ExperimentFixture, activeView: WorkspaceView): WorkspaceState {
  const old = structuredClone(experiment.oldContract)
  const next = structuredClone(experiment.newContract)
  const oldDraft = contractToDraft(old)
  const newDraft = contractToDraft(next)
  return {
    selectedExperimentId: experiment.id, activeView,
    workingOldContract: old, workingNewContract: next,
    draftOldContract: oldDraft, draftNewContract: newDraft,
    appliedOldDraft: structuredClone(oldDraft), appliedNewDraft: structuredClone(newDraft),
    draftIssues: { old: [], new: [] }, applyStatus: 'idle',
    searchDraft: createSearchOptionsDraft(), searchIssues: [], searchFailure: [], searchSnapshot: null,
    proofState: { status: 'idle' }, minimizationOptionsDraft: createMinimizationOptionsDraft(), minimizationIssues: [],
  }
}

/** One in-memory workspace; raw form text never enters the calculation engine. */
export function useWorkspace(): WorkspaceController {
  const [state, setState] = useState(() => initialState(experiments[0], 'dashboard'))
  // Imported evidence is independent of all current experiment/search resets.
  const [importedProofState, setImportedProofState] = useState<ImportedProofState>({ status: 'idle' })
  const [evidenceView, setEvidenceViewState] = useState<EvidenceView>('workspace')
  const [exportIssues, setExportIssues] = useState<PortableIssue[]>([])
  const importRequest = useRef(0)
  useEffect(() => () => { importRequest.current += 1 }, [])
  const selectedExperiment = experiments.find((item) => item.id === state.selectedExperimentId) ?? experiments[0]
  const comparison = useMemo(() => compareContracts(
    state.workingOldContract, state.workingNewContract, selectedExperiment.scenario,
  ), [state.workingOldContract, state.workingNewContract, selectedExperiment.scenario])
  const searchBase = useMemo(() => createSearchBase(selectedExperiment.scenario), [selectedExperiment.scenario])
  const searchBaseComparison = useMemo(() => state.activeView === 'counterexample-hunter' && searchBase.success
    ? compareContracts(state.workingOldContract, state.workingNewContract, searchBase.data) : null,
  [state.activeView, state.workingOldContract, state.workingNewContract, searchBase])

  function selectExperiment(id: string) {
    const experiment = experiments.find((item) => item.id === id)
    if (!experiment) return
    setState((prior) => prior.selectedExperimentId === id
      ? prior : initialState(experiment, prior.activeView))
  }
  function setActiveView(view: WorkspaceView) {
    setState((prior) => ({ ...prior, activeView: view }))
  }
  function updateDraft(side: ContractSide, draft: ContractDraft) {
    setState((prior) => ({
      ...prior,
      ...(side === 'old' ? { draftOldContract: draft } : { draftNewContract: draft }),
      draftIssues: { old: [], new: [] }, applyStatus: 'idle',
    }))
  }
  function applyChanges() {
    const old = parseContractDraft(state.workingOldContract, state.draftOldContract)
    const next = parseContractDraft(state.workingNewContract, state.draftNewContract)
    if (!old.success || !next.success) {
      setState((prior) => ({
        ...prior, applyStatus: 'invalid',
        draftIssues: { old: old.success ? [] : old.issues, new: next.success ? [] : next.issues },
      }))
      return
    }
    // Both contracts commit together only after both full validators succeed.
    setState((prior) => ({
      ...prior, workingOldContract: old.data, workingNewContract: next.data,
      appliedOldDraft: structuredClone(prior.draftOldContract),
      appliedNewDraft: structuredClone(prior.draftNewContract),
      draftIssues: { old: [], new: [] }, applyStatus: 'applied',
      searchSnapshot: null, searchFailure: [], searchIssues: [],
      proofState: { status: 'idle' }, minimizationIssues: [],
    }))
  }
  function resetOriginal() {
    setState((prior) => ({ ...initialState(selectedExperiment, prior.activeView), applyStatus: 'reset' }))
  }
  function updateSearchDraft(field: keyof SearchOptionsDraft, value: string) {
    setState((prior) => prior.searchDraft[field] === value ? prior : ({
      ...prior, searchDraft: { ...prior.searchDraft, [field]: value },
      searchIssues: [], searchFailure: [], searchSnapshot: null,
      proofState: { status: 'idle' }, minimizationIssues: [],
    }))
  }
  function runSearch() {
    const options = parseSearchOptionsDraft(state.searchDraft)
    if (!options.success) {
      setState((prior) => ({ ...prior, searchIssues: options.issues, searchFailure: [], searchSnapshot: null,
        proofState: { status: 'idle' }, minimizationIssues: [] }))
      return
    }
    if (!searchBase.success) {
      setState((prior) => ({ ...prior, searchIssues: [], searchFailure: searchBase.issues, searchSnapshot: null,
        proofState: { status: 'idle' }, minimizationIssues: [] }))
      return
    }
    // Search receives detached, applied data only; the snapshot records exactly that input.
    const oldContract = structuredClone(state.workingOldContract)
    const newContract = structuredClone(state.workingNewContract)
    const baseScenario = structuredClone(searchBase.data)
    const result = searchCounterexamples(oldContract, newContract, baseScenario, options.data)
    setState((prior) => ({
      ...prior, searchIssues: [], searchFailure: result.success ? [] : result.issues,
      proofState: { status: 'idle' }, minimizationIssues: [],
      searchSnapshot: result.success ? {
        oldContract, newContract, baseScenario, searchOptions: options.data,
        searchReport: result.data, selectedWitnessId: result.data.witnesses[0]?.candidateId ?? null,
      } : null,
    }))
  }
  function selectWitness(candidateId: string) {
    setState((prior) => {
      const snapshot = prior.searchSnapshot
      if (!snapshot || snapshot.selectedWitnessId === candidateId
        || !snapshot.searchReport.witnesses.some((item) => item.candidateId === candidateId)) return prior
      return { ...prior, searchSnapshot: { ...snapshot, selectedWitnessId: candidateId },
        proofState: { status: 'idle' }, minimizationIssues: [] }
    })
  }
  function clearProof() {
    setState((prior) => ({ ...prior, proofState: { status: 'idle' }, minimizationIssues: [] }))
  }
  function updateMinimizationOptionsDraft(value: string) {
    setState((prior) => prior.minimizationOptionsDraft.maxChecks === value ? prior : ({
      ...prior, minimizationOptionsDraft: { maxChecks: value },
      proofState: { status: 'idle' }, minimizationIssues: [],
    }))
  }
  function generateProof() {
    const snapshot = state.searchSnapshot
    const witness = snapshot?.searchReport.witnesses.find((item) => item.candidateId === snapshot.selectedWitnessId)
    if (!snapshot || !witness) {
      setState((prior) => ({ ...prior, proofState: { status: 'idle' }, minimizationIssues: [{
        path: ['witness'], code: 'no_witness_selected',
        message: 'No witness selected. Run a counterexample search and select a witness first.',
      }] }))
      return
    }
    const options = parseMinimizationOptionsDraft(state.minimizationOptionsDraft)
    if (!options.success) {
      setState((prior) => ({ ...prior, proofState: { status: 'idle' }, minimizationIssues: options.issues }))
      return
    }
    // Creation and fresh verification are separate explicit calls, never render effects.
    const created = createImpactProof(snapshot.oldContract, snapshot.newContract, witness, snapshot.searchOptions, options.data)
    if (!created.success) {
      setState((prior) => ({ ...prior, minimizationIssues: [],
        proofState: { status: 'failure', phase: 'creation', proof: null, issues: created.issues } }))
      return
    }
    const verification = verifyImpactProof(created.data)
    setState((prior) => ({ ...prior, minimizationIssues: [], proofState: verification.success
      ? { status: 'success', proof: created.data, verification: verification.data }
      : { status: 'failure', phase: 'verification', proof: created.data, issues: verification.issues } }))
  }
  function verifyProofAgain() {
    if (state.proofState.status === 'idle' || !state.proofState.proof) return
    const proof = state.proofState.proof
    const verification = verifyImpactProof(proof)
    setState((prior) => ({ ...prior, proofState: verification.success
      ? { status: 'success', proof, verification: verification.data }
      : { status: 'failure', phase: 'verification', proof, issues: verification.issues } }))
  }
  function setEvidenceView(view: EvidenceView) {
    setEvidenceViewState(view)
    setExportIssues([])
  }
  async function importProofFile(file: File | undefined) {
    const request = ++importRequest.current
    setEvidenceViewState('imported')
    setExportIssues([])
    setImportedProofState(file ? { status: 'reading', fileName: file.name } : { status: 'idle' })
    try {
      const result = await readAndVerifyProofFile(file)
      if (request !== importRequest.current) return
      setImportedProofState(result.success
        ? { status: 'success', fileName: file?.name ?? '', proof: result.data.proof, verification: result.data }
        : { status: 'failure', phase: result.phase, fileName: file?.name ?? null, proof: null, issues: result.issues })
    } catch {
      if (request !== importRequest.current) return
      setImportedProofState({ status: 'failure', phase: 'import', fileName: file?.name ?? null, proof: null,
        issues: [{ code: 'import_failed', path: [], message: 'Unable to read or verify the local Proof JSON file.' }] })
    }
  }
  function clearImportedProof() {
    importRequest.current += 1
    setImportedProofState({ status: 'idle' })
    setExportIssues([])
  }
  function verifyImportedProofAgain() {
    if ((importedProofState.status !== 'success' && importedProofState.status !== 'failure') || !importedProofState.proof) return
    importRequest.current += 1
    setExportIssues([])
    const proof = importedProofState.proof
    try {
      const verified = verifyImpactProof(proof)
      setImportedProofState(verified.success
        ? { status: 'success', fileName: importedProofState.fileName ?? '', proof: verified.data.proof, verification: verified.data }
        : { status: 'failure', phase: 'verification', fileName: importedProofState.fileName, proof, issues: verified.issues })
    } catch {
      setImportedProofState({ status: 'failure', phase: 'verification', fileName: importedProofState.fileName, proof,
        issues: [{ code: 'verification_error', path: [], message: 'Imported proof verification could not complete.' }] })
    }
  }
  function exportEvidence(prepare: (input: unknown) => PortableResult<TextDownload>) {
    const proof = evidenceView === 'workspace'
      ? state.proofState.status === 'success' ? state.proofState.proof : null
      : importedProofState.status === 'success' ? importedProofState.proof : null
    setExportIssues([])
    if (!proof) {
      setExportIssues([{ code: 'proof_not_verified', path: [], message: 'Select a successfully verified proof before downloading evidence.' }])
      return
    }
    try {
      const prepared = prepare(proof)
      if (!prepared.success) {
        setExportIssues(prepared.issues)
        return
      }
      downloadTextFile(prepared.data)
    } catch {
      setExportIssues([{ code: 'export_failed', path: [], message: 'Unable to prepare or start the local evidence download. Try downloading again.' }])
    }
  }
  function downloadProofJson() { exportEvidence(prepareProofJsonExport) }
  function downloadMarkdownReport() { exportEvidence(prepareMarkdownExport) }
  return {
    ...state, selectedExperiment, comparison, searchBase, searchBaseComparison,
    evidenceView, importedProofState, exportIssues,
    oldModified: JSON.stringify(state.workingOldContract) !== JSON.stringify(selectedExperiment.oldContract),
    newModified: JSON.stringify(state.workingNewContract) !== JSON.stringify(selectedExperiment.newContract),
    hasUnappliedChanges: JSON.stringify(state.draftOldContract) !== JSON.stringify(state.appliedOldDraft)
      || JSON.stringify(state.draftNewContract) !== JSON.stringify(state.appliedNewDraft),
    selectExperiment, setActiveView, updateDraft, applyChanges, resetOriginal,
    updateSearchDraft, runSearch, selectWitness,
    updateMinimizationOptionsDraft, generateProof, verifyProofAgain, clearProof,
    setEvidenceView, importProofFile, verifyImportedProofAgain, clearImportedProof,
    downloadProofJson, downloadMarkdownReport,
  }
}
