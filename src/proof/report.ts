import type { CalculationTrace, Comparison } from '../engine'
import { scenarioObjective } from '../minimizer/invariants'
import type { Scenario } from '../models'
import { verifyImpactProof } from './proof'
import type { ImpactReportResult } from './types'

/** Exact cents formatting, independent of locale and floating point currency arithmetic. */
function usd(cents: number): string {
  const value = BigInt(cents)
  const absolute = value < 0n ? -value : value
  return `${value < 0n ? '-' : ''}$${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`
}

function deltaUsd(cents: number): string {
  return `${cents > 0 ? '+' : ''}${usd(cents)}`
}

function markdown(value: string): string {
  return value.replace(/([\\`*_[\]<>|#])/g, '\\$1').replace(/[\r\n]/g, ' ')
}

function scenarioReport(title: string, scenario: Scenario): string[] {
  const objective = scenarioObjective(scenario)
  const lines = [
    `## ${title}`, '',
    `Scenario: ${markdown(scenario.id)}. Billing month: ${scenario.billingMonth}.`, '',
    `${objective.purchaseCount} purchases, purchase total ${usd(objective.purchaseTotalCents)}, total payment delay ${objective.totalLateDays} calendar days.`, '',
  ]
  if (scenario.transactions.length) {
    lines.push('| Purchase ID | Date | Amount |', '| --- | --- | ---: |')
    for (const item of scenario.transactions) lines.push(`| ${markdown(item.id)} | ${item.occurredOn} | ${usd(item.amountCents)} |`)
    lines.push('')
  } else lines.push('No purchases.', '')
  if (scenario.paymentEvents.length) {
    lines.push('| Payment ID | Due date | Paid date | Obligation amount |', '| --- | --- | --- | ---: |')
    for (const item of scenario.paymentEvents) {
      lines.push(`| ${markdown(item.id)} | ${item.dueOn} | ${item.paidOn} | ${usd(item.amountCents)} |`)
    }
    lines.push('')
  } else lines.push('No payment obligations.', '')
  return lines
}

function traceDescription(trace: CalculationTrace): string {
  if (trace.ruleType === 'monthlyFee') {
    const actual = trace.waiverKind === 'minTransactionCount'
      ? `${trace.actualTransactionCount} purchases against count threshold ${trace.threshold}`
      : `${usd(trace.actualPurchaseTotalCents)} purchased against threshold ${usd(trace.threshold)}`
    return `Monthly fee ${usd(trace.originalFeeCents)}; ${actual}; waiver ${trace.waived ? 'applied' : 'not applied'}; charged ${usd(trace.chargedCents)}.`
  }
  if (trace.ruleType === 'transactionFee') {
    return `Purchase ${markdown(trace.transactionId)}: amount ${usd(trace.amountCents)}, rate ${trace.rateBps} bps, rounded variable fee ${usd(trace.variableFeeCents)}, fixed fee ${usd(trace.fixedCents)}, charged ${usd(trace.chargedCents)}.`
  }
  return `Payment ${markdown(trace.paymentEventId)}: due ${trace.dueOn}, paid ${trace.paidOn}, ${trace.lateDays} late days, ${trace.graceDays} grace days, grace ${trace.graceExceeded ? 'exceeded' : 'not exceeded'}, charged ${usd(trace.chargedCents)}.`
}

function totalsReport(comparison: Comparison): string[] {
  return [
    '| Metric | Amount |', '| --- | ---: |',
    `| Old Contract Total | ${usd(comparison.oldEvaluation.totalCents)} |`,
    `| New Contract Total | ${usd(comparison.newEvaluation.totalCents)} |`,
    `| Cost Difference (new minus old) | ${deltaUsd(comparison.deltaCents)} |`, '',
  ]
}

/** Verify submitted evidence before generating a deterministic Markdown report. */
export function formatImpactReport(proofInput: unknown): ImpactReportResult {
  const verified = verifyImpactProof(proofInput)
  if (!verified.success) return verified
  const proof = verified.data.proof
  const comparison = proof.minimizedComparison
  const originalObjective = scenarioObjective(proof.originalScenario)
  const minimizedObjective = scenarioObjective(proof.minimizedScenario)
  const options = proof.searchOptions
  const budget = proof.minimizationBudget
  const lines = [
    '# Financial Experiment', '',
    `**${markdown(proof.oldContract.name)} → ${markdown(proof.newContract.name)}**`, '',
    `Old contract: ${markdown(proof.oldContract.id)} v${markdown(proof.oldContract.version)}. New contract: ${markdown(proof.newContract.id)} v${markdown(proof.newContract.version)}.`, '',
    `Witness ${markdown(proof.witnessSource.candidateId)}, source ${proof.witnessSource.source}, sequence ${proof.witnessSource.sequence}.`, '',
    ...scenarioReport('Original Scenario', proof.originalScenario),
    ...totalsReport(proof.originalComparison),
    ...scenarioReport('Minimized Scenario', proof.minimizedScenario),
    ...totalsReport(comparison),
    '## Rule-Level Impact', '',
    '| Rule | Old total | New total | Difference |', '| --- | ---: | ---: | ---: |',
  ]
  for (const [name, key] of [
    ['Monthly fee', 'monthlyFeeCents'], ['Transaction fee', 'transactionFeeCents'], ['Late fee', 'lateFeeCents'],
  ] as const) {
    lines.push(`| ${name} | ${usd(comparison.oldEvaluation[key])} | ${usd(comparison.newEvaluation[key])} | ${deltaUsd(comparison.deltaByCategoryCents[key])} |`)
  }
  lines.push('', '### Old Contract Calculation Trace', '')
  if (comparison.oldEvaluation.trace.length) {
    for (const trace of comparison.oldEvaluation.trace) lines.push(`- ${traceDescription(trace)}`)
  } else lines.push('No enabled rules emitted calculation entries.')
  lines.push('', '### New Contract Calculation Trace', '')
  if (comparison.newEvaluation.trace.length) {
    for (const trace of comparison.newEvaluation.trace) lines.push(`- ${traceDescription(trace)}`)
  } else lines.push('No enabled rules emitted calculation entries.')
  lines.push(
    '', '## Reduction Summary', '',
    `Purchases: ${originalObjective.purchaseCount} → ${minimizedObjective.purchaseCount}. Purchase total: ${usd(originalObjective.purchaseTotalCents)} → ${usd(minimizedObjective.purchaseTotalCents)}. Total late days: ${originalObjective.totalLateDays} → ${minimizedObjective.totalLateDays}.`, '',
    `Cost difference: ${deltaUsd(proof.originalComparison.deltaCents)} → ${deltaUsd(comparison.deltaCents)}.`, '',
    `${budget.checksPerformed}/${budget.maxChecks} minimization comparisons; ${proof.reductionSteps.length} accepted reductions. Termination: ${budget.terminationReason}. Budget exhausted: ${budget.budgetExhausted ? 'yes' : 'no'}.`, '',
  )
  if (proof.reductionSteps.length) {
    lines.push('| Step | Type | Purchases | Purchase total | Late days | Verified difference |', '| ---: | --- | --- | --- | --- | ---: |')
    for (const [index, step] of proof.reductionSteps.entries()) {
      const before = scenarioObjective(step.before)
      const after = step.validation.objective
      lines.push(`| ${index + 1} | ${step.type} | ${before.purchaseCount} → ${after.purchaseCount} | ${usd(before.purchaseTotalCents)} → ${usd(after.purchaseTotalCents)} | ${before.totalLateDays} → ${after.totalLateDays} | ${deltaUsd(step.validation.deltaCents)} |`)
    }
    lines.push('')
  } else lines.push('No valid improvement was accepted under this strategy and budget.', '')
  lines.push(
    '## Reproduction Information', '',
    `Proof schema: ${proof.proofSchemaVersion}. Engine: ${proof.engineVersion}. Minimizer: ${proof.minimizerVersion}. Search seed: ${options.seed}.`, '',
    'Recorded Stage 4A search options:', '', '```json', JSON.stringify(options, null, 2), '```', '',
    'Load the proof JSON and call verifyImpactProof(proof). Original and minimized results are recalculated with compareContracts(oldContract, newContract, scenario). To repeat minimization, use the recorded original witness fields, searchOptions and maxChecks with minimizeWitness.', '',
    `${verified.data.verifiedComparisons} financial comparisons were recomputed when formatting this report. Recorded search provenance and rejected minimization attempts are not authenticated.`, '',
    'Calculation policy:', '',
  )
  for (const [key, value] of Object.entries(proof.calculationPolicy)) lines.push(`- ${key}: ${value}.`)
  lines.push('', '## Limitations', '')
  for (const limitation of proof.limitations) lines.push(`- ${limitation}`)
  return { success: true, data: `${lines.join('\n')}\n` }
}
