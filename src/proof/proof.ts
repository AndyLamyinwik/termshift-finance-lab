import { compareContracts } from '../engine'
import type { EnginePath } from '../engine'
import { minimizeWitness } from '../minimizer/minimize'
import {
  compareObjectives, invariantIssues, rangeIssues, sameData, scenarioObjective,
} from '../minimizer/invariants'
import type { MinimizationIssue, ReductionStep } from '../minimizer/types'
import { ContractSchema } from '../models'
import { SearchOptionsSchema } from '../search'
import { WitnessSchema } from '../minimizer/schemas'
import { ImpactProofSchema } from './schemas'
import { CALCULATION_POLICY, ENGINE_VERSION, MINIMIZER_VERSION, PROOF_LIMITATIONS } from './types'
import type { ImpactProof, ImpactProofResult, ImpactProofVerificationResult } from './types'

function mismatch(path: EnginePath, message: string): MinimizationIssue {
  return { code: 'proof_mismatch', path, message }
}

function prefixIssues(issues: MinimizationIssue[], prefix: EnginePath): MinimizationIssue[] {
  return issues.map((issue) => ({ ...issue, path: [...prefix, ...issue.path] }))
}

/** A step must describe exactly its recorded kind of edit, not hide additional changes. */
function stepTypeMatches(step: ReductionStep): boolean {
  const before = step.before
  const after = step.after
  if (step.type === 'remove-purchases') {
    return after.transactions.length < before.transactions.length
      && sameData(before.paymentEvents, after.paymentEvents)
      && after.transactions.every((item) => sameData(item, before.transactions.find((prior) => prior.id === item.id)))
  }
  if (step.type === 'lower-purchase-amount') {
    if (before.transactions.length !== after.transactions.length || !sameData(before.paymentEvents, after.paymentEvents)) return false
    let changed = 0
    const valid = after.transactions.every((item, index) => {
      const prior = before.transactions[index]
      if (!prior) return false
      if (sameData(prior, item)) return true
      changed += 1
      return item.amountCents < prior.amountCents && sameData({ ...prior, amountCents: item.amountCents }, item)
    })
    return valid && changed >= 1
  }
  if (!sameData(before.transactions, after.transactions) || before.paymentEvents.length !== after.paymentEvents.length) return false
  let changed = 0
  const valid = after.paymentEvents.every((item, index) => {
    const prior = before.paymentEvents[index]
    if (!prior) return false
    if (sameData(prior, item)) return true
    changed += 1
    return item.paidOn < prior.paidOn && sameData({ ...prior, paidOn: item.paidOn }, item)
  })
  return valid && changed >= 1
}

/** Create complete evidence from an untrusted Stage 4A witness and fresh minimization. */
export function createImpactProof(
  oldContractInput: unknown,
  newContractInput: unknown,
  witnessInput: unknown,
  searchOptionsInput: unknown,
  minimizationOptionsInput?: unknown,
): ImpactProofResult {
  const result = minimizeWitness(oldContractInput, newContractInput, witnessInput, searchOptionsInput, minimizationOptionsInput)
  if (!result.success) return result
  // The minimizer has validated these inputs. Parse once more to obtain detached data.
  const oldContract = ContractSchema.parse(oldContractInput)
  const newContract = ContractSchema.parse(newContractInput)
  const witness = WitnessSchema.parse(witnessInput)
  const reduction = result.data
  const proof: ImpactProof = {
    proofSchemaVersion: 1,
    engineVersion: ENGINE_VERSION,
    minimizerVersion: MINIMIZER_VERSION,
    oldContract,
    newContract,
    witnessSource: {
      candidateId: witness.candidateId, sequence: witness.sequence, source: witness.source,
      ...(witness.parameters ? { parameters: witness.parameters } : {}),
    },
    searchOptions: SearchOptionsSchema.parse(searchOptionsInput),
    originalScenario: reduction.originalScenario,
    minimizedScenario: reduction.minimizedScenario,
    originalComparison: reduction.originalComparison,
    minimizedComparison: reduction.minimizedComparison,
    reductionSteps: reduction.reductionSteps,
    minimizationBudget: {
      ...reduction.minimizationOptions, checksPerformed: reduction.checksPerformed,
      budgetExhausted: reduction.budgetExhausted, terminationReason: reduction.terminationReason,
    },
    calculationPolicy: { ...CALCULATION_POLICY },
    limitations: [...PROOF_LIMITATIONS],
  }
  return { success: true, data: proof }
}

/** Recompute evidence; this verifies arithmetic and constraints, not historic provenance. */
export function verifyImpactProof(proofInput: unknown): ImpactProofVerificationResult {
  const parsed = ImpactProofSchema.safeParse(proofInput)
  if (!parsed.success) {
    return {
      success: false,
      issues: parsed.error.issues.map((issue) => ({
        code: 'validation_error', path: issue.path.map((part) => typeof part === 'number' ? part : String(part)),
        message: issue.message, validationCode: issue.code,
      })),
    }
  }
  const proof = parsed.data
  const budget = proof.minimizationBudget
  if (budget.checksPerformed > budget.maxChecks || proof.reductionSteps.length + 1 > budget.checksPerformed
    || budget.budgetExhausted !== (budget.checksPerformed === budget.maxChecks)
    || (budget.terminationReason === 'budget-exhausted') !== budget.budgetExhausted) {
    return { success: false, issues: [mismatch(['minimizationBudget'], 'Budget counters, accepted steps and termination reason are inconsistent.')] }
  }
  const constraints = [
    ...prefixIssues(rangeIssues(proof.originalScenario, proof.searchOptions), ['originalScenario']),
    ...prefixIssues(rangeIssues(proof.minimizedScenario, proof.searchOptions), ['minimizedScenario']),
    ...prefixIssues(invariantIssues(proof.originalScenario, proof.minimizedScenario), ['minimizedScenario']),
  ]
  if (constraints.length) return { success: false, issues: constraints }
  const original = compareContracts(proof.oldContract, proof.newContract, proof.originalScenario)
  if (!original.success) return { success: false, issues: prefixIssues(original.issues, ['originalComparison']) }
  if (!sameData(original.data, proof.originalComparison)) {
    return { success: false, issues: [mismatch(['originalComparison'], 'Recorded original comparison does not match the current engine calculation.')] }
  }
  if (original.data.deltaCents === 0) {
    return { success: false, issues: [mismatch(['originalComparison', 'deltaCents'], 'The original scenario must be a nonzero counterexample.')] }
  }
  const minimized = compareContracts(proof.oldContract, proof.newContract, proof.minimizedScenario)
  if (!minimized.success) return { success: false, issues: prefixIssues(minimized.issues, ['minimizedComparison']) }
  if (!sameData(minimized.data, proof.minimizedComparison)) {
    return { success: false, issues: [mismatch(['minimizedComparison'], 'Recorded minimized comparison does not match the current engine calculation.')] }
  }
  const direction = Math.sign(original.data.deltaCents)
  if (minimized.data.deltaCents === 0 || Math.sign(minimized.data.deltaCents) !== direction) {
    return { success: false, issues: [mismatch(['minimizedComparison', 'deltaCents'], 'The reduced result must retain a nonzero delta in the original direction.')] }
  }
  let scenario = proof.originalScenario
  let comparison = original.data
  let verifiedComparisons = 2
  for (const [index, step] of proof.reductionSteps.entries()) {
    const path: EnginePath = ['reductionSteps', index]
    if (!sameData(step.before, scenario) || !stepTypeMatches(step)) {
      return { success: false, issues: [mismatch(path, 'Reduction steps must form a continuous chain and match their declared edit type.')] }
    }
    const stepIssues = [
      ...invariantIssues(step.before, step.after),
      ...invariantIssues(proof.originalScenario, step.after),
      ...rangeIssues(step.after, proof.searchOptions),
    ]
    if (stepIssues.length) return { success: false, issues: prefixIssues(stepIssues, [...path, 'after']) }
    const objective = scenarioObjective(step.after)
    if (compareObjectives(objective, scenarioObjective(step.before)) >= 0 || !sameData(objective, step.validation.objective)) {
      return { success: false, issues: [mismatch([...path, 'validation', 'objective'], 'Each accepted step must strictly improve the recorded lexicographic objective.')] }
    }
    const actual = compareContracts(proof.oldContract, proof.newContract, step.after)
    verifiedComparisons += 1
    if (!actual.success) return { success: false, issues: prefixIssues(actual.issues, [...path, 'comparison']) }
    if (!sameData(actual.data, step.comparison) || actual.data.deltaCents !== step.validation.deltaCents) {
      return { success: false, issues: [mismatch([...path, 'comparison'], 'Recorded reduction comparison or delta does not match the current calculation.')] }
    }
    if (actual.data.deltaCents === 0 || Math.sign(actual.data.deltaCents) !== direction) {
      return { success: false, issues: [mismatch([...path, 'validation', 'deltaCents'], 'Every accepted reduction must keep a nonzero delta in the original direction.')] }
    }
    scenario = step.after
    comparison = actual.data
  }
  if (!sameData(scenario, proof.minimizedScenario) || !sameData(comparison, proof.minimizedComparison)) {
    return { success: false, issues: [mismatch(['reductionSteps'], 'The reduction chain must end at the recorded minimized scenario and comparison.')] }
  }
  const source = proof.witnessSource
  const verifiedProof: ImpactProof = {
    ...proof,
    witnessSource: {
      candidateId: source.candidateId, sequence: source.sequence, source: source.source,
      ...(source.parameters ? { parameters: source.parameters } : {}),
    },
  }
  return { success: true, data: { proof: verifiedProof, verifiedComparisons } }
}
