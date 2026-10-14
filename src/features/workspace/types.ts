import type { Comparison, EngineResult } from '../../engine'
import type { Contract, Scenario } from '../../models'
import type { ExperimentFixture } from '../../scenarios'
import type { MinimizationIssue } from '../../minimizer'
import type { ImpactProof, ImpactProofVerification } from '../../proof'
import type { SearchIssue, SearchOptions, SearchReport } from '../../search'
import type { ContractDraft, DraftIssue } from '../financial-diff/drafts'
import type { SearchOptionsDraft } from '../hunter/options'
import type { MinimizationOptionsDraft } from '../proof-viewer/options'
import type { PortableIssue } from '../portable-evidence/portable'

export type WorkspaceView = 'dashboard' | 'financial-diff' | 'counterexample-hunter' | 'proof-of-impact'
export type ContractSide = 'old' | 'new'

export interface SearchSnapshot {
  oldContract: Contract
  newContract: Contract
  baseScenario: Scenario
  searchOptions: SearchOptions
  searchReport: SearchReport
  selectedWitnessId: string | null
}

export type ProofState =
  | { status: 'idle' }
  | { status: 'success'; proof: ImpactProof; verification: ImpactProofVerification }
  | { status: 'failure'; phase: 'creation' | 'verification'; proof: ImpactProof | null; issues: MinimizationIssue[] }

export type EvidenceView = 'workspace' | 'imported'
export type ImportedProofState =
  | { status: 'idle' }
  | { status: 'reading'; fileName: string }
  | { status: 'success'; fileName: string; proof: ImpactProof; verification: ImpactProofVerification }
  | { status: 'failure'; phase: 'import' | 'verification'; fileName: string | null; proof: ImpactProof | null; issues: PortableIssue[] }

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
  proofState: ProofState
  minimizationOptionsDraft: MinimizationOptionsDraft
  minimizationIssues: DraftIssue[]
  evidenceView: EvidenceView
  importedProofState: ImportedProofState
  exportIssues: PortableIssue[]
  selectExperiment(id: string): void
  setActiveView(view: WorkspaceView): void
  updateDraft(side: ContractSide, draft: ContractDraft): void
  applyChanges(): void
  resetOriginal(): void
  updateSearchDraft(field: keyof SearchOptionsDraft, value: string): void
  runSearch(): void
  selectWitness(candidateId: string): void
  updateMinimizationOptionsDraft(value: string): void
  generateProof(): void
  verifyProofAgain(): void
  clearProof(): void
  setEvidenceView(view: EvidenceView): void
  importProofFile(file: File | undefined): Promise<void>
  verifyImportedProofAgain(): void
  clearImportedProof(): void
  downloadProofJson(): void
  downloadMarkdownReport(): void
}
