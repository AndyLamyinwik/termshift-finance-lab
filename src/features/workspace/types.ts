import type { Comparison, EngineResult } from '../../engine'
import type { Contract } from '../../models'
import type { ExperimentFixture } from '../../scenarios'
import type { ContractDraft, DraftIssue } from '../financial-diff/drafts'

export type WorkspaceView = 'dashboard' | 'financial-diff'
export type ContractSide = 'old' | 'new'

export interface WorkspaceController {
  selectedExperimentId: string
  selectedExperiment: ExperimentFixture
  workingOldContract: Contract
  workingNewContract: Contract
  activeView: WorkspaceView
  draftOldContract: ContractDraft
  draftNewContract: ContractDraft
  draftIssues: Record<ContractSide, DraftIssue[]>
  applyStatus: 'idle' | 'applied' | 'invalid' | 'reset'
  hasUnappliedChanges: boolean
  oldModified: boolean
  newModified: boolean
  comparison: EngineResult<Comparison>
  selectExperiment(id: string): void
  setActiveView(view: WorkspaceView): void
  updateDraft(side: ContractSide, draft: ContractDraft): void
  applyChanges(): void
  resetOriginal(): void
}
