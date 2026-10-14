import { z } from 'zod'
import { ContractSchema } from '../models'
import { SearchOptionsSchema } from '../search'
import {
  ComparisonSchema, ReductionStepSchema, SearchScenarioSchema, WitnessSchema,
} from '../minimizer/schemas'
import { CALCULATION_POLICY, ENGINE_VERSION, MINIMIZER_VERSION, PROOF_LIMITATIONS } from './types'

const ProofObjectSchema = z.strictObject({
  proofSchemaVersion: z.literal(1),
  engineVersion: z.literal(ENGINE_VERSION),
  minimizerVersion: z.literal(MINIMIZER_VERSION),
  oldContract: ContractSchema,
  newContract: ContractSchema,
  witnessSource: WitnessSchema.pick({ candidateId: true, sequence: true, source: true, parameters: true }),
  searchOptions: SearchOptionsSchema,
  originalScenario: SearchScenarioSchema,
  minimizedScenario: SearchScenarioSchema,
  originalComparison: ComparisonSchema,
  minimizedComparison: ComparisonSchema,
  reductionSteps: z.array(ReductionStepSchema).max(299),
  minimizationBudget: z.strictObject({
    maxChecks: z.number().int().min(1).max(300),
    checksPerformed: z.number().int().min(1).max(300),
    budgetExhausted: z.boolean(),
    terminationReason: z.enum(['budget-exhausted', 'strategy-complete']),
  }),
  calculationPolicy: z.strictObject({
    currency: z.literal(CALCULATION_POLICY.currency),
    moneyUnit: z.literal(CALCULATION_POLICY.moneyUnit),
    rateUnit: z.literal(CALCULATION_POLICY.rateUnit),
    rounding: z.literal(CALCULATION_POLICY.rounding),
    dates: z.literal(CALCULATION_POLICY.dates),
    delta: z.literal(CALCULATION_POLICY.delta),
    effectiveDate: z.literal(CALCULATION_POLICY.effectiveDate),
  }),
  limitations: z.tuple([
    z.literal(PROOF_LIMITATIONS[0]), z.literal(PROOF_LIMITATIONS[1]), z.literal(PROOF_LIMITATIONS[2]),
    z.literal(PROOF_LIMITATIONS[3]), z.literal(PROOF_LIMITATIONS[4]),
  ]),
})

/** Reject excessive histories before traversing their scenario/trace contents. */
export const ImpactProofSchema = z.preprocess((input, context) => {
  if (input && typeof input === 'object') {
    const steps = (input as Record<string, unknown>).reductionSteps
    if (Array.isArray(steps) && steps.length > 299) {
      context.addIssue({ code: 'custom', path: ['reductionSteps'], message: 'A proof accepts at most 299 accepted reductions.' })
      return z.NEVER
    }
  }
  return input
}, ProofObjectSchema)
