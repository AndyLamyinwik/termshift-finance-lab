import { useMemo, useState } from 'react'
import { compareContracts } from '../../engine'
import { experiments } from '../../scenarios'
import type { ExperimentFixture } from '../../scenarios'
import { contractToDraft, parseContractDraft } from '../financial-diff/drafts'
import type { ContractDraft } from '../financial-diff/drafts'
import type { ContractSide, WorkspaceController, WorkspaceView } from './types'

type WorkspaceState = Pick<WorkspaceController,
  'selectedExperimentId' | 'workingOldContract' | 'workingNewContract' | 'activeView'
  | 'draftOldContract' | 'draftNewContract' | 'draftIssues' | 'applyStatus'> & {
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
  }
}

/** One in-memory workspace; raw form text never enters the calculation engine. */
export function useWorkspace(): WorkspaceController {
  const [state, setState] = useState(() => initialState(experiments[0], 'dashboard'))
  const selectedExperiment = experiments.find((item) => item.id === state.selectedExperimentId) ?? experiments[0]
  const comparison = useMemo(() => compareContracts(
    state.workingOldContract, state.workingNewContract, selectedExperiment.scenario,
  ), [state.workingOldContract, state.workingNewContract, selectedExperiment.scenario])

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
    }))
  }
  function resetOriginal() {
    setState((prior) => ({ ...initialState(selectedExperiment, prior.activeView), applyStatus: 'reset' }))
  }
  return {
    ...state, selectedExperiment, comparison,
    oldModified: JSON.stringify(state.workingOldContract) !== JSON.stringify(selectedExperiment.oldContract),
    newModified: JSON.stringify(state.workingNewContract) !== JSON.stringify(selectedExperiment.newContract),
    hasUnappliedChanges: JSON.stringify(state.draftOldContract) !== JSON.stringify(state.appliedOldDraft)
      || JSON.stringify(state.draftNewContract) !== JSON.stringify(state.appliedNewDraft),
    selectExperiment, setActiveView, updateDraft, applyChanges, resetOriginal,
  }
}
