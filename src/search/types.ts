import type { Comparison, EngineIssue, EnginePath } from '../engine'
import type { Scenario } from '../models'

export interface SearchOptions {
  seed: number
  maxEvaluations: number
  maxResults: number
  purchaseCountMin: number
  purchaseCountMax: number
  purchaseAmountCentsMin: number
  purchaseAmountCentsMax: number
  lateDaysMin: number
  lateDaysMax: number
}

export interface CandidateParameters {
  purchaseCount: number
  purchaseAmountCents: number
  lateDays: number
}

export type CandidateSource = 'base' | 'boundary' | 'seeded'
export type SearchIssue = EngineIssue | {
  code: 'capacity_exceeded' | 'candidate_date_out_of_range'
  path: EnginePath
  message: string
}

export type CandidateGenerationResult =
  | { success: true; scenario: Scenario }
  | { success: false; issues: SearchIssue[] }

export interface CandidateRecord {
  candidateId: string
  sequence: number
  source: CandidateSource
  parameters?: CandidateParameters
  status: 'evaluated' | 'comparison_failed' | 'duplicate' | 'out_of_range' | 'invalid_scenario'
  deltaCents?: number
  duplicateOf?: string
  issues?: SearchIssue[]
}

export interface Witness {
  candidateId: string
  sequence: number
  source: CandidateSource
  parameters?: CandidateParameters
  scenario: Scenario
  comparison: Comparison
  deltaCents: number
}

export interface SearchCoverage {
  method: 'boundary-and-seeded'
  scenarioFamily: 'uniform-purchases-shared-delay'
  generatedSpaceSize: number
  visitedParameterCount: number
  complete: boolean
}

export interface SearchReport {
  seed: number
  searchOptions: SearchOptions
  evaluatedCount: number
  maxEvaluations: number
  skippedCount: number
  failedCount: number
  budgetExhausted: boolean
  stopReason: 'budget' | 'space-covered' | 'attempt-limit'
  status: 'witnesses-found' | 'no-witness-found'
  message: string
  witnesses: Witness[]
  coverage: SearchCoverage
  sourceEvaluations: Record<CandidateSource, number>
  candidates: CandidateRecord[]
}

export type SearchResult =
  | { success: true; data: SearchReport }
  | { success: false; issues: SearchIssue[] }
