import { z } from 'zod'
import { MinimizationOptionsSchema } from '../../minimizer'
import type { MinimizationOptions } from '../../minimizer'
import { parseIntegerInput } from '../financial-diff/drafts'
import type { DraftResult } from '../financial-diff/drafts'

export interface MinimizationOptionsDraft {
  maxChecks: string
}

const MinimizationOptionsDraftSchema = z.strictObject({ maxChecks: z.string() })

/** An independent canonical text draft for the existing core's default budget. */
export function createMinimizationOptionsDraft(): MinimizationOptionsDraft {
  return { maxChecks: String(MinimizationOptionsSchema.parse({}).maxChecks) }
}

/** Parse bounded integer text exactly, then validate with the unchanged Stage 4B schema. */
export function parseMinimizationOptionsDraft(input: unknown): DraftResult<MinimizationOptions> {
  const draft = MinimizationOptionsDraftSchema.safeParse(input)
  if (!draft.success) {
    return {
      success: false,
      issues: draft.error.issues.map((issue) => ({
        path: issue.path.map((part) => typeof part === 'number' ? part : String(part)),
        code: issue.code,
        message: issue.message,
      })),
    }
  }

  const integer = parseIntegerInput(draft.data.maxChecks, 1, 300)
  if (!integer.success) {
    return {
      success: false,
      issues: integer.issues.map((issue) => ({ ...issue, path: ['maxChecks', ...issue.path] })),
    }
  }

  const options = MinimizationOptionsSchema.safeParse({ maxChecks: integer.data })
  return options.success
    ? { success: true, data: options.data }
    : {
      success: false,
      issues: options.error.issues.map((issue) => ({
        path: issue.path.map((part) => typeof part === 'number' ? part : String(part)),
        code: issue.code,
        message: issue.message,
      })),
    }
}
