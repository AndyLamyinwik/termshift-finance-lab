import { z } from 'zod'
import { ContractSchema } from './contract'
import type { Contract } from './contract'
import { ScenarioSchema } from './scenario'
import type { Scenario } from './scenario'

export interface ValidationIssue {
  path: (string | number)[]
  code: string
  message: string
}

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; issues: ValidationIssue[] }

function validate<T>(schema: z.ZodType<T>, input: unknown): ValidationResult<T> {
  const result = schema.safeParse(input)
  if (result.success) return { success: true, data: result.data }

  return {
    success: false,
    issues: result.error.issues.map((issue) => ({
      path: issue.path.map((part) => typeof part === 'number' ? part : String(part)),
      code: issue.code,
      message: issue.message,
    })),
  }
}

export function validateContract(input: unknown): ValidationResult<Contract> {
  return validate(ContractSchema, input)
}

export function validateScenario(input: unknown): ValidationResult<Scenario> {
  return validate(ScenarioSchema, input)
}
