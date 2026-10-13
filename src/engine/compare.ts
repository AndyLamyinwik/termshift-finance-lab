import { validateContract, validateScenario } from '../models'
import { evaluateValidatedContract, prefixValidationIssues } from './evaluate'
import { MoneyOverflowError, toSafeInteger } from './money'
import type { Comparison, EngineIssue, EngineResult } from './types'

function prefixEvaluationIssues(issues: EngineIssue[], source: string): EngineIssue[] {
  return issues.map((issue) => ({ ...issue, path: [source, ...issue.path] }))
}

export function compareContracts(
  oldContractInput: unknown,
  newContractInput: unknown,
  scenarioInput: unknown,
): EngineResult<Comparison> {
  const oldContract = validateContract(oldContractInput)
  const newContract = validateContract(newContractInput)
  const scenario = validateScenario(scenarioInput)
  if (!oldContract.success || !newContract.success || !scenario.success) {
    return {
      success: false,
      issues: [
        ...(oldContract.success ? [] : prefixValidationIssues(oldContract.issues, 'oldContract')),
        ...(newContract.success ? [] : prefixValidationIssues(newContract.issues, 'newContract')),
        ...(scenario.success ? [] : prefixValidationIssues(scenario.issues, 'scenario')),
      ],
    }
  }

  // Both evaluations receive the exact same parsed scenario, without mutation.
  const oldResult = evaluateValidatedContract(oldContract.data, scenario.data)
  const newResult = evaluateValidatedContract(newContract.data, scenario.data)
  if (!oldResult.success || !newResult.success) {
    return {
      success: false,
      issues: [
        ...(oldResult.success ? [] : prefixEvaluationIssues(oldResult.issues, 'oldEvaluation')),
        ...(newResult.success ? [] : prefixEvaluationIssues(newResult.issues, 'newEvaluation')),
      ],
    }
  }

  const oldEvaluation = oldResult.data
  const newEvaluation = newResult.data
  try {
    return {
      success: true,
      data: {
        oldEvaluation,
        newEvaluation,
        deltaCents: toSafeInteger(
          BigInt(newEvaluation.totalCents) - BigInt(oldEvaluation.totalCents),
          ['deltaCents'],
        ),
        deltaByCategoryCents: {
          monthlyFeeCents: toSafeInteger(
            BigInt(newEvaluation.monthlyFeeCents) - BigInt(oldEvaluation.monthlyFeeCents),
            ['deltaByCategoryCents', 'monthlyFeeCents'],
          ),
          transactionFeeCents: toSafeInteger(
            BigInt(newEvaluation.transactionFeeCents) - BigInt(oldEvaluation.transactionFeeCents),
            ['deltaByCategoryCents', 'transactionFeeCents'],
          ),
          lateFeeCents: toSafeInteger(
            BigInt(newEvaluation.lateFeeCents) - BigInt(oldEvaluation.lateFeeCents),
            ['deltaByCategoryCents', 'lateFeeCents'],
          ),
        },
      },
    }
  } catch (error) {
    if (!(error instanceof MoneyOverflowError)) throw error
    return {
      success: false,
      issues: [{ code: 'overflow', path: [...error.path], message: error.message }],
    }
  }
}
