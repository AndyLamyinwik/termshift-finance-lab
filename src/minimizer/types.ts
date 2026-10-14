import type { Comparison, EngineIssue, EnginePath } from '../engine'
import type { Scenario } from '../models'

export interface MinimizationOptions { maxChecks: number }
export interface MinimizationObjective {
  purchaseCount: number
  purchaseTotalCents: number
  totalLateDays: number
}
export type MinimizationIssue = EngineIssue | {
  code: 'witness_mismatch' | 'not_counterexample' | 'out_of_bounds' | 'invariant_violation' | 'proof_mismatch'
  path: EnginePath
  message: string
}
export type EvidenceResult<T> =
  | { success: true; data: T }
  | { success: false; issues: MinimizationIssue[] }
export interface ReductionStep {
  type: 'remove-purchases' | 'lower-purchase-amount' | 'reduce-payment-delay'
  before: Scenario
  after: Scenario
  reason: string
  validation: { success: true; deltaCents: number; objective: MinimizationObjective }
  comparison: Comparison
}
export interface MinimizationResult {
  originalWitnessId: string
  originalScenario: Scenario
  minimizedScenario: Scenario
  originalComparison: Comparison
  minimizedComparison: Comparison
  originalDeltaCents: number
  minimizedDeltaCents: number
  checksPerformed: number
  budgetExhausted: boolean
  terminationReason: 'budget-exhausted' | 'strategy-complete'
  reductionSteps: ReductionStep[]
  minimizationOptions: MinimizationOptions
  originalObjective: MinimizationObjective
  minimizedObjective: MinimizationObjective
  candidateFailures: { scenario: Scenario; issues: MinimizationIssue[] }[]
}
