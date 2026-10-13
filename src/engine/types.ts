export type EnginePath = (string | number)[]

export interface EngineIssue {
  code: 'validation_error' | 'overflow'
  path: EnginePath
  message: string
  validationCode?: string
}

export type EngineResult<T> =
  | { success: true; data: T }
  | { success: false; issues: EngineIssue[] }

interface MonthlyFeeTraceBase {
  ruleType: 'monthlyFee'
  originalFeeCents: number
  threshold: number
  waived: boolean
  chargedCents: number
}

export type MonthlyFeeTrace = MonthlyFeeTraceBase & (
  | { waiverKind: 'minTransactionCount'; actualTransactionCount: number }
  | { waiverKind: 'minPurchaseTotalCents'; actualPurchaseTotalCents: number }
)

export interface TransactionFeeTrace {
  ruleType: 'transactionFee'
  transactionId: string
  amountCents: number
  fixedCents: number
  rateBps: number
  variableFeeCents: number
  chargedCents: number
}

export interface LateFeeTrace {
  ruleType: 'lateFee'
  paymentEventId: string
  dueOn: string
  paidOn: string
  originalFeeCents: number
  lateDays: number
  graceDays: number
  graceExceeded: boolean
  chargedCents: number
}

export type CalculationTrace = MonthlyFeeTrace | TransactionFeeTrace | LateFeeTrace

export interface FeeCategoryCents {
  monthlyFeeCents: number
  transactionFeeCents: number
  lateFeeCents: number
}

export interface Evaluation extends FeeCategoryCents {
  contractId: string
  contractVersion: string
  scenarioId: string
  currency: 'USD'
  totalCents: number
  trace: CalculationTrace[]
}

export interface Comparison {
  oldEvaluation: Evaluation
  newEvaluation: Evaluation
  deltaCents: number
  deltaByCategoryCents: FeeCategoryCents
}
