import type { Comparison, EngineResult } from '../../engine'
import type { Contract, Scenario } from '../../models'
import type { ExperimentFixture } from '../../scenarios'
import type { SearchIssue, SearchOptions, SearchReport } from '../../search'
import type { ContractDraft, DraftIssue } from '../financial-diff/drafts'
import type { SearchOptionsDraft } from '../hunter/options'

export type WorkspaceView = 'dashboard' | 'financial-diff' | 'counterexample-hunter'
export type ContractSide = 'old' | 'new'

export interface SearchSnapshot {
  oldContract: Contract
  newContract: Contract
  baseScenario: Scenario
  searchOptions: SearchOptions
  searchReport: SearchReport
  selectedWitnessId: string | null
}

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
  searchDraft: SearchOptionsDraft
  searchIssues: DraftIssue[]
  searchFailure: SearchIssue[]
  searchSnapshot: SearchSnapshot | null
  searchBase: EngineResult<Scenario>
  searchBaseComparison: EngineResult<Comparison> | null
  selectExperiment(id: string): void
  setActiveView(view: WorkspaceView): void
  updateDraft(side: ContractSide, draft: ContractDraft): void
  applyChanges(): void
  resetOriginal(): void
  updateSearchDraft(field: keyof SearchOptionsDraft, value: string): void
  runSearch(): void
  selectWitness(candidateId: string): void
}
