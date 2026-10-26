import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createServer } from 'vite'

const root = resolve(import.meta.dirname, '..')
const output = resolve(root, 'public/case-studies/paypal-usd')
const server = await createServer({
  root,
  configFile: false,
  server: { middlewareMode: true, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
  appType: 'custom',
})
try {
  const { buildPayPalCaseStudy, createPayPalEvidence, paypalSource, planA, planB, paypalUsd, paypalDelta, renderPayPalFeeCurve } =
    await server.ssrLoadModule('/src/case-studies/paypal-usd/index.ts')
  const study = buildPayPalCaseStudy()
  await mkdir(output, { recursive: true })
  const json = value => `${JSON.stringify(value, null, 2)}\n`
  await writeFile(resolve(output, 'source-capture.json'), json(paypalSource))
  await writeFile(resolve(output, 'results.json'), json({
    caseStudyVersion: 1,
    source: paypalSource,
    labels: { planA: 'Checkout', planB: 'Static Micropayments model', delta: 'B minus A' },
    schemaMapping: { oldContract: 'planA', newContract: 'planB' },
    contracts: { planA, planB },
    rows: study.rows,
    chartPoints: study.chartPoints,
  }))
  await writeFile(resolve(output, 'fee-curve.svg'), renderPayPalFeeCurve(study.chartPoints))
  const summary = [
    '# PayPal US domestic USD: published-plan comparison', '',
    'A = Checkout (3.49% + USD 0.49). B = Static Micropayments model (4.99% + USD 0.09). These are two published schedules, not old/new prices or real account transactions.', '',
    `Observed ${paypalSource.capturedOn} (Asia/Shanghai); fee page shows last updated ${paypalSource.feePageUpdatedOn}. [Official fee page](${paypalSource.url}) · [Micropayments terms](${paypalSource.termsUrl}#micropayments) · [Structured source record](source-capture.json).`, '',
    'B assumes a previously approved Static account and an eligible payment type. Dynamic Micropayments instead chooses the lower applicable fee for each transaction. Static is not guaranteed to be available and PayPal may convert accounts to Dynamic. Domestic means both parties are registered or identified as residents of the same market; here that market is US.', '',
    'TermShift assumes proportional fees are rounded half up to cents per transaction, followed by a fixed fee. This is not a verified PayPal rounding policy. Excludes cross-border, currency conversion, refunds/reversals, disputes/chargebacks, negotiated rates, taxes and other products. Transactions and contract metadata are synthetic. No account access, eligibility confirmation, or financial advice.', '',
    '![Sampled engine fee curve](fee-curve.svg)', '',
    'The lines connect sampled engine results; exact rounded fees are listed below. USD 26.66 and 26.67 both produce ties under this model: an unrounded intersection is not a unique rounded switch point.', '',
    '| Scenario | Independent A | Engine A | Independent B | Engine B | B − A |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...study.rows.map(row => `| ${row.label} | ${paypalUsd(row.expected.planACents)} | ${paypalUsd(row.comparison.oldEvaluation.totalCents)} | ${paypalUsd(row.expected.planBCents)} | ${paypalUsd(row.comparison.newEvaluation.totalCents)} | ${paypalDelta(row.comparison.deltaCents)} |`), '',
    'Expectations are fixed independently calculated integer-cent values, checked against the official engine and a separate reference calculator in tests. Fixed fees and rounding apply per receipt: splitting one USD 10 receipt into ten USD 1 receipts changes A from USD 0.84 to USD 5.20 and B from USD 0.59 to USD 1.40.', '',
    '## Reproducible evidence', '',
    'Every nonzero listed scenario has a formal Proof Schema v1 file, created from a real one-evaluation base-witness search and independently verified. Import its JSON through the main app → Proof of Impact → Import Proof JSON. JSON uses oldContract/newContract as legacy field names for A/B. The reports explicitly label A/B and explain original versus minimized evidence. Equal-fee scenarios are in results.json; they are not fabricated nonzero counterexamples.', '',
  ]
  let proofs = 0
  for (const row of study.rows) {
    if (row.comparison.deltaCents === 0) continue
    const evidence = createPayPalEvidence(row.id)
    await writeFile(resolve(output, `${row.id}-proof.json`), json(evidence.proof))
    await writeFile(resolve(output, `${row.id}-report.md`), evidence.markdown)
    summary.push(`- ${row.label}: [Proof JSON](${row.id}-proof.json) · [Markdown report](${row.id}-report.md)`)
    proofs += 1
  }
  summary.push('', '[Complete scenarios, comparisons, expectations and chart data](results.json). Source data is recorded separately and is not authenticated by Proof Verified.', '')
  await writeFile(resolve(output, 'case-study.md'), summary.join('\n'))
  console.log(`Generated PayPal case study: ${study.rows.length} scenarios, ${study.chartPoints.length} chart samples, ${proofs} verified proofs.`)
} finally {
  await server.close()
}
