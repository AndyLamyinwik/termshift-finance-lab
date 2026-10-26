import { createImpactProof, formatImpactReport, verifyImpactProof } from '../../proof'
import type { ImpactProof } from '../../proof'
import { searchCounterexamples } from '../../search'
import type { SearchOptions } from '../../search'
import { paypalSource, planA, planB } from './fixtures'
import { buildPayPalCaseStudy } from './study'

/** A real one-evaluation search records the supplied scenario as its base witness. */
export function createPayPalEvidence(caseId: string): { proof: ImpactProof; markdown: string } {
  const row = buildPayPalCaseStudy().rows.find(entry => entry.id === caseId)
  if (!row) throw new Error(`Unknown PayPal case: ${caseId}.`)
  if (row.comparison.deltaCents === 0) {
    throw new Error(`PayPal case ${caseId} has equal fees and is not a nonzero counterexample.`)
  }
  const amounts = row.scenario.transactions.map(item => item.amountCents)
  const options: SearchOptions = {
    seed: 20261027,
    maxEvaluations: 1,
    maxResults: 1,
    purchaseCountMin: amounts.length,
    purchaseCountMax: amounts.length,
    purchaseAmountCentsMin: Math.min(...amounts),
    purchaseAmountCentsMax: Math.max(...amounts),
    lateDaysMin: 0,
    lateDaysMax: 0,
  }
  const search = searchCounterexamples(planA, planB, row.scenario, options)
  if (!search.success) throw new Error(`PayPal witness search failed for ${caseId}.`)
  const witness = search.data.witnesses.find(entry => entry.source === 'base')
  if (!witness) throw new Error(`PayPal base scenario was not retained as a witness for ${caseId}.`)
  const created = createImpactProof(planA, planB, witness, options, { maxChecks: 200 })
  if (!created.success) throw new Error(`PayPal proof creation failed for ${caseId}: ${created.issues.map(issue => issue.message).join('; ')}`)
  const verified = verifyImpactProof(created.data)
  if (!verified.success) throw new Error(`PayPal proof verification failed for ${caseId}.`)
  const formatted = formatImpactReport(verified.data.proof)
  if (!formatted.success) throw new Error(`PayPal report verification failed for ${caseId}.`)

  // Only human-facing labels are adapted. The official JSON schema and all engine
  // values remain unchanged; its legacy old/new fields map to A/B, not a timeline.
  const officialReport = formatted.data
    .replaceAll('Old Contract', 'Plan A (Checkout)')
    .replaceAll('New Contract', 'Plan B (Static Micropayments)')
    .replaceAll('Old contract:', 'Plan A model:')
    .replaceAll('New contract:', 'Plan B model:')
    .replaceAll('new minus old', 'B minus A')
    .replaceAll('Old total', 'Plan A total')
    .replaceAll('New total', 'Plan B total')
    .replaceAll('new contract total minus old contract total', 'Plan B total minus Plan A total')
    .replace(/^\*\*.* → .*\*\*$/m, '**Plan A (Checkout) compared with Plan B (Static Micropayments model)**')
  const prefix = [
    '# PayPal USD published-rate evidence', '',
    `Case: ${row.label} (${row.id}).`, '',
    '**Plan A: PayPal Checkout — 3.49% + USD 0.49.**',
    '**Plan B: Static Micropayments rate model — 4.99% + USD 0.09.**', '',
    'This compares two published fee schedules on synthetic merchant receipts. It is not a historical price change, a PayPal invoice, an account eligibility check, or an assertion of actual fees charged.', '',
    `Source record: source-capture.json. Captured: ${paypalSource.capturedOn} (Asia/Shanghai). Fee-page update shown: ${paypalSource.feePageUpdatedOn}.`,
    `Official fees: ${paypalSource.url}`,
    `Eligibility terms: ${paypalSource.termsUrl}#micropayments`, '',
    'Scope: US domestic commercial receipts, USD, eligible payment types and a previously approved Static Micropayments account for B. Dynamic Micropayments automatically selects the lower applicable fee per eligible transaction and is not represented by B. PayPal need not offer Static pricing and may convert Static accounts to Dynamic. Cross-border, currency conversion, refunds, reversals, disputes, chargebacks, negotiated rates, taxes and other products are excluded.', '',
    'Rounding is a TermShift model assumption: round the proportional fee half up to cents separately for each transaction, then add its fixed fee. This case does not establish PayPal uses the same rounding policy.', '',
    'Schema mapping: oldContract = Plan A; newContract = Plan B; deltaCents = B minus A. Both contract versions and effectiveDate values are fixture metadata, not PayPal product versions or implementation dates. Existing proof limitations also apply to these model inputs.', '',
    'The recorded base witness came from a one-evaluation formal search. Purchase count is pinned to the supplied scenario; amount bounds span its original amounts. Uniform cases therefore have no available reduction; mixed cases may accept a reduction while preserving the difference direction. These bounds are not a claim of global minimality. Original and minimized results are separately recorded.', '',
    'To independently reverify, import the matching *-proof.json through TermShift → Proof of Impact → Import Proof JSON. The source record is separate provenance data, not part of Proof Schema v1 and not an authenticated signature.', '',
  ].join('\n')
  return { proof: verified.data.proof, markdown: `${prefix}\n${officialReport}` }
}
