import type { Comparison } from '../engine'
import type { Contract, Scenario } from '../models'
import type { CandidateParameters, CandidateSource, SearchOptions } from '../search'
import type { EvidenceResult, ReductionStep } from '../minimizer/types'

export const ENGINE_VERSION = 'stage3-v1' as const
export const MINIMIZER_VERSION = 'stage4b-v1' as const
export const CALCULATION_POLICY = Object.freeze({
  currency: 'USD',
  moneyUnit: 'integer USD cents',
  rateUnit: 'integer basis points; 10000 bps = 100 percent',
  rounding: 'round half up separately for each transaction before adding its fixed fee',
  dates: 'Gregorian calendar days; early payments have zero late days',
  delta: 'new contract total minus old contract total',
  effectiveDate: 'descriptive contract metadata; does not restrict counterfactual scenarios',
} as const)
export const PROOF_LIMITATIONS = Object.freeze([
  'Contracts and transactions are synthetic financial experiments.',
  'A reduced witness is not a proof of a globally minimal counterexample.',
  'Verification checks the submitted calculations and constraints, not authenticated historical search execution.',
  'This JSON evidence has no digital signature, tamper-proof guarantee or financial regulatory certification.',
  'Search coverage.complete describes visited parameter tuples, not successful financial evaluation of every scenario.',
] as const)

export interface WitnessSource {
  candidateId: string
  sequence: number
  source: CandidateSource
  parameters?: CandidateParameters
}

export interface ImpactProof {
  proofSchemaVersion: 1
  engineVersion: typeof ENGINE_VERSION
  minimizerVersion: typeof MINIMIZER_VERSION
  oldContract: Contract
  newContract: Contract
  witnessSource: WitnessSource
  searchOptions: SearchOptions
  originalScenario: Scenario
  minimizedScenario: Scenario
  originalComparison: Comparison
  minimizedComparison: Comparison
  reductionSteps: ReductionStep[]
  minimizationBudget: {
    maxChecks: number
    checksPerformed: number
    budgetExhausted: boolean
    terminationReason: 'budget-exhausted' | 'strategy-complete'
  }
  calculationPolicy: typeof CALCULATION_POLICY
  limitations: [...typeof PROOF_LIMITATIONS]
}

export interface ImpactProofVerification {
  proof: ImpactProof
  /** Actual compareContracts calls made during this verification. */
  verifiedComparisons: number
}

export type ImpactProofResult = EvidenceResult<ImpactProof>
export type ImpactProofVerificationResult = EvidenceResult<ImpactProofVerification>
export type ImpactReportResult = EvidenceResult<string>
