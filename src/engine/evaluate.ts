import { validateContract, validateScenario } from '../models'
import type {
  Contract,
  LateFeeRule,
  MonthlyFeeRule,
  PaymentEvent,
  Scenario,
  Transaction,
  TransactionFeeRule,
  ValidationIssue,
} from '../models'
import { calendarDaysBetween } from './dates'
import { MoneyOverflowError, roundHalfUp, toSafeInteger } from './money'
import type { CalculationTrace, EngineIssue, EngineResult, Evaluation } from './types'

function evaluateMonthlyFee(
  rule: MonthlyFeeRule | undefined,
  scenario: Scenario,
  trace: CalculationTrace[],
): bigint {
  if (!rule) return 0n
  const originalFeeCents = toSafeInteger(BigInt(rule.feeCents))

  if (rule.waiver.kind === 'minTransactionCount') {
    const actualTransactionCount = scenario.transactions.length
    const waived = actualTransactionCount >= rule.waiver.threshold
    const chargedCents = waived ? 0 : originalFeeCents
    trace.push({
      ruleType: 'monthlyFee',
      originalFeeCents,
      waiverKind: rule.waiver.kind,
      threshold: rule.waiver.threshold,
      actualTransactionCount,
      waived,
      chargedCents,
    })
    return BigInt(chargedCents)
  }

  const purchaseTotal = scenario.transactions.reduce(
    (total, transaction) => total + BigInt(transaction.amountCents),
    0n,
  )
  const actualPurchaseTotalCents = toSafeInteger(
    purchaseTotal,
    ['trace', trace.length, 'actualPurchaseTotalCents'],
  )
  const waived = purchaseTotal >= BigInt(rule.waiver.threshold)
  const chargedCents = waived ? 0 : originalFeeCents
  trace.push({
    ruleType: 'monthlyFee',
    originalFeeCents,
    waiverKind: rule.waiver.kind,
    threshold: rule.waiver.threshold,
    actualPurchaseTotalCents,
    waived,
    chargedCents,
  })
  return BigInt(chargedCents)
}

function evaluateTransactionFees(
  rule: TransactionFeeRule | undefined,
  transactions: Transaction[],
  trace: CalculationTrace[],
): bigint {
  if (!rule) return 0n
  const fixedCents = toSafeInteger(BigInt(rule.fixedCents))
  const rateBps = toSafeInteger(BigInt(rule.rateBps))

  let total = 0n
  for (const transaction of transactions) {
    const variableFee = roundHalfUp(
      BigInt(transaction.amountCents) * BigInt(rateBps),
      10000n,
    )
    const charged = BigInt(fixedCents) + variableFee
    trace.push({
      ruleType: 'transactionFee',
      transactionId: transaction.id,
      amountCents: transaction.amountCents,
      fixedCents,
      rateBps,
      variableFeeCents: toSafeInteger(variableFee, ['trace', trace.length, 'variableFeeCents']),
      chargedCents: toSafeInteger(charged, ['trace', trace.length, 'chargedCents']),
    })
    total += charged
  }
  return total
}

function evaluateLateFees(
  rule: LateFeeRule | undefined,
  paymentEvents: PaymentEvent[],
  trace: CalculationTrace[],
): bigint {
  if (!rule) return 0n
  const originalFeeCents = toSafeInteger(BigInt(rule.feeCents))
  const graceDays = toSafeInteger(BigInt(rule.graceDays))

  let total = 0n
  for (const event of paymentEvents) {
    const lateDays = Math.max(0, calendarDaysBetween(event.dueOn, event.paidOn))
    const graceExceeded = lateDays > graceDays
    const chargedCents = graceExceeded ? originalFeeCents : 0
    trace.push({
      ruleType: 'lateFee',
      paymentEventId: event.id,
      dueOn: event.dueOn,
      paidOn: event.paidOn,
      originalFeeCents,
      lateDays,
      graceDays,
      graceExceeded,
      chargedCents,
    })
    total += BigInt(chargedCents)
  }
  return total
}

// Internal entry point: callers must supply data parsed by the Stage 2 validators.
export function evaluateValidatedContract(
  contract: Contract,
  scenario: Scenario,
): EngineResult<Evaluation> {
  try {
    const trace: CalculationTrace[] = []
    const monthlyFee = evaluateMonthlyFee(contract.rules.monthlyFee, scenario, trace)
    const transactionFee = evaluateTransactionFees(contract.rules.transactionFee, scenario.transactions, trace)
    const lateFee = evaluateLateFees(contract.rules.lateFee, scenario.paymentEvents, trace)

    return {
      success: true,
      data: {
        contractId: contract.id,
        contractVersion: contract.version,
        scenarioId: scenario.id,
        currency: contract.currency,
        monthlyFeeCents: toSafeInteger(monthlyFee, ['monthlyFeeCents']),
        transactionFeeCents: toSafeInteger(transactionFee, ['transactionFeeCents']),
        lateFeeCents: toSafeInteger(lateFee, ['lateFeeCents']),
        totalCents: toSafeInteger(monthlyFee + transactionFee + lateFee, ['totalCents']),
        trace,
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

export function prefixValidationIssues(issues: ValidationIssue[], source: string): EngineIssue[] {
  return issues.map((issue) => ({
    code: 'validation_error',
    path: [source, ...issue.path],
    message: issue.message,
    validationCode: issue.code,
  }))
}

export function evaluateContract(contractInput: unknown, scenarioInput: unknown): EngineResult<Evaluation> {
  const contract = validateContract(contractInput)
  const scenario = validateScenario(scenarioInput)
  if (!contract.success || !scenario.success) {
    return {
      success: false,
      issues: [
        ...(contract.success ? [] : prefixValidationIssues(contract.issues, 'contract')),
        ...(scenario.success ? [] : prefixValidationIssues(scenario.issues, 'scenario')),
      ],
    }
  }
  return evaluateValidatedContract(contract.data, scenario.data)
}
