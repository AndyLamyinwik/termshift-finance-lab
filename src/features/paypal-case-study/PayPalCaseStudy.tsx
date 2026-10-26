import { useState } from 'react'
import type { MouseEvent } from 'react'
import { buildPayPalCaseStudy, buildPayPalResultsDocument, createPayPalEvidence, renderPayPalFeeCurve } from '../../case-studies/paypal-usd'
import { paypalSource } from '../../case-studies/paypal-usd/fixtures'
import { formatDeltaCents, formatUsdCents } from '../dashboard/format'
import { downloadTextFile } from '../portable-evidence/portable'
import type { TextDownload } from '../portable-evidence/portable'

const base = import.meta.env.BASE_URL
const assets = `${base}case-studies/paypal-usd/`

function StudyContent({ study }: { study: ReturnType<typeof buildPayPalCaseStudy> }) {
  const [exportError, setExportError] = useState('')

  function download(event: MouseEvent<HTMLAnchorElement>, payload: () => TextDownload) {
    // Keep static file URLs usable for modified clicks and link context menus.
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    try {
      downloadTextFile(payload())
      setExportError('')
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'The local export could not complete.')
    }
  }

  function evidence(caseId: string, format: 'json' | 'markdown'): TextDownload {
    // Recreate from the real search and independently verify before every export.
    const result = createPayPalEvidence(caseId)
    return format === 'json'
      ? { text: JSON.stringify(result.proof, null, 2), fileName: `${caseId}-proof.json`, mimeType: 'application/json;charset=utf-8' }
      : { text: result.markdown, fileName: `${caseId}-report.md`, mimeType: 'text/markdown;charset=utf-8' }
  }

  return <>
    {exportError && <section className="case-panel case-error" role="alert">
      <h2>Unable to download</h2>
      <p>{exportError} Your comparison results are unchanged. Try the download again.</p>
    </section>}
    <section className="case-panel case-scope" aria-labelledby="case-scope-title">
      <p className="case-eyebrow">Scope before results</p>
      <h2 id="case-scope-title">One market, two fee schedules</h2>
      <p>US domestic commercial receipts in USD, assuming an eligible payment and account for each schedule.
        The transaction inputs are fictional. These are two published plans, not a historical price change
        or a complete representation of a PayPal contract.</p>
      <div className="case-plan-grid">
        <article className="case-plan case-plan-a" aria-label="Plan A: PayPal Checkout">
          <span className="case-plan-code">A</span>
          <h3>PayPal Checkout</h3>
          <p className="case-rate">3.49% <span>+ $0.49 per transaction</span></p>
          <p>Model: <code>rateBps = 349</code>, <code>fixedCents = 49</code>.</p>
        </article>
        <article className="case-plan case-plan-b" aria-label="Plan B: Static Micropayments">
          <span className="case-plan-code">B</span>
          <h3>Static Micropayments</h3>
          <p className="case-rate">4.99% <span>+ $0.09 per transaction</span></p>
          <p>Model: <code>rateBps = 499</code>, <code>fixedCents = 9</code>.</p>
        </article>
      </div>
      <aside className="case-important" aria-label="Micropayments eligibility">
        <strong>Static pricing is a conditional scenario.</strong>
        <p>PayPal describes Static Micropayments for previously approved accounts; not every payment type is eligible,
          and PayPal may convert an account to Dynamic pricing. Static availability or approval is not assumed for a new account.</p>
        <p><strong>Dynamic Micropayments is different:</strong> it automatically chooses the applicable lower fee for each transaction.
          Plan B models the static fee schedule, not that automatic selection.</p>
      </aside>
      <p className="case-muted">Excluded: international surcharges, currency conversion, refunds, reversals, chargebacks,
        disputes, taxes, negotiated rates, account-specific exceptions, and other products.</p>
    </section>

    <section className="case-panel" aria-labelledby="case-curve-title">
      <p className="case-eyebrow">Single transaction · USD</p>
      <h2 id="case-curve-title">Amount versus modeled fee</h2>
      <figure className="case-curve">
        <img src={`${assets}fee-curve.svg`} alt="Fee curve for Plan A Checkout and Plan B Static Micropayments from $0.01 to $100. Exact selected values appear in the comparison table." />
        <figcaption>Fees come from the TermShift engine. Lines connect sampled amounts; the table and evidence contain exact rounded results.
          The real-valued fee formulas intersect near $26.67, but cent rounding creates equal-fee cases around that amount.</figcaption>
      </figure>
      <a className="case-text-link" href={`${assets}fee-curve.svg`} download onClick={event => download(event, () => ({
        text: renderPayPalFeeCurve(study.chartPoints), fileName: 'paypal-usd-fee-curve.svg', mimeType: 'image/svg+xml;charset=utf-8',
      }))}>Download fee curve (SVG)</a>
    </section>

    <section className="case-panel" aria-labelledby="case-results-title">
      <p className="case-eyebrow">Independent expectations × official engine</p>
      <h2 id="case-results-title">Recalculate each scenario</h2>
      <p>Expected values are independently calculated with integer arithmetic and checked against the engine.
        Delta is <strong>B − A</strong>: a positive value means Plan B costs more for the modeled scenario.</p>
      <p id="case-table-help" className="case-muted">On narrow screens, scroll the table horizontally. All amounts below are USD.</p>
      <div className="case-table-scroll" role="region" aria-label="Scrollable comparison results" aria-describedby="case-table-help" tabIndex={0}>
        <table className="case-results-table">
          <caption>Published-rate scenarios: independent expected fees and engine results</caption>
          <thead><tr>
            <th scope="col">Scenario</th><th scope="col">Gross</th><th scope="col">Expected A</th><th scope="col">Engine A</th>
            <th scope="col">Expected B</th><th scope="col">Engine B</th><th scope="col">B − A</th><th scope="col">Check</th><th scope="col">Evidence</th>
          </tr></thead>
          <tbody>{study.rows.map(row => <tr key={row.id} data-scenario-id={row.id}>
            <th scope="row">{row.label}</th>
            <td>{formatUsdCents(Number(row.scenario.transactions.reduce((sum, transaction) => sum + BigInt(transaction.amountCents), 0n)))}</td>
            <td>{formatUsdCents(row.expected.planACents)}</td><td>{formatUsdCents(row.comparison.oldEvaluation.totalCents)}</td>
            <td>{formatUsdCents(row.expected.planBCents)}</td><td>{formatUsdCents(row.comparison.newEvaluation.totalCents)}</td>
            <td>{formatDeltaCents(row.comparison.deltaCents)}</td><td><span className="case-match">Match</span></td>
            <td>{row.comparison.deltaCents === 0
              ? <span>Equal fees; no nonzero witness</span>
              : <span className="case-evidence-links"><a href={`${assets}${row.id}-proof.json`} download aria-label={`Download JSON for ${row.label}`} onClick={event => download(event, () => evidence(row.id, 'json'))}>JSON</a><a href={`${assets}${row.id}-report.md`} download aria-label={`Download Markdown for ${row.label}`} onClick={event => download(event, () => evidence(row.id, 'markdown'))}>Markdown</a></span>}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <p><a href={`${assets}results.json`} download onClick={event => download(event, () => ({
        text: JSON.stringify(buildPayPalResultsDocument(study), null, 2), fileName: 'paypal-usd-results.json', mimeType: 'application/json;charset=utf-8',
      }))}>Download all scenarios and comparison results (JSON)</a></p>
      <div className="case-insight-grid">
        <article><h3>Fixed fees matter at small amounts</h3><p>At $10, A costs $0.84 and B costs $0.59. At $30, A costs $1.54 and B costs $1.59 under the stated model.</p></article>
        <article><h3>Transaction count matters too</h3><p>Ten $1 transactions apply each plan’s fixed fee ten times. Their total fees differ from one $10 transaction, despite equal gross receipts.</p></article>
        <article><h3>Rounding matters at the crossover</h3><p>Both $26.66 and $26.67 produce equal $1.42 fees. The unrounded crossover is not a unique boundary for rounded cents.</p></article>
      </div>
    </section>

    <section className="case-panel" aria-labelledby="case-evidence-title">
      <p className="case-eyebrow">Portable evidence</p>
      <h2 id="case-evidence-title">Verify the saved JSON yourself</h2>
      <ol className="case-steps">
        <li>Download a scenario’s <strong>JSON</strong> above. Its companion <strong>Markdown</strong> is a readable report.</li>
        <li>Open the <a href={base}>TermShift lab</a>, choose <strong>Proof of Impact</strong>, then <strong>Import Proof JSON</strong>.</li>
        <li>Select the downloaded file and inspect <strong>Imported Proof</strong>. The existing verifier independently recalculates its evidence.</li>
      </ol>
      <p>Equal-fee scenarios have complete comparison data in <code>results.json</code>, rather than a nonzero-witness proof.
        Proof files keep the existing schema: <code>oldContract</code> means <strong>Plan A</strong> and <code>newContract</code> means <strong>Plan B</strong>.
        These field names do not imply chronological changes.</p>
      <p>Verification confirms calculation consistency, not authentic authorship, account eligibility, actual PayPal deductions, or a global optimum.
        The recorded search uses a finite budget; scenario-pinned reductions do not claim a globally minimal witness.</p>
      <p className="case-muted">Downloads are generated locally from the same fixed case inputs; no live PayPal data is requested. Import remains limited to 5 MiB and does not replace working contracts.</p>
    </section>

    <section className="case-panel" aria-labelledby="case-source-title">
      <p className="case-eyebrow">Source and assumptions</p>
      <h2 id="case-source-title">Published inputs, explicit model policy</h2>
      <dl className="case-source-grid">
        <div><dt>Market / currency</dt><dd>United States · domestic · USD</dd></div>
        <div><dt>Source checked</dt><dd>{paypalSource.capturedOn}</dd></div>
        <div><dt>Fee page last updated</dt><dd>{paypalSource.feePageUpdatedOn}</dd></div>
        <div><dt>Financial units</dt><dd>Integer USD cents and basis points</dd></div>
      </dl>
      <p><a href={paypalSource.url} target="_blank" rel="noreferrer">PayPal US merchant fee table</a> · <a href={paypalSource.termsUrl} target="_blank" rel="noreferrer">PayPal US User Agreement: Micropayments</a> · <a href={`${assets}source-capture.json`} download onClick={event => download(event, () => ({
        text: JSON.stringify(paypalSource, null, 2), fileName: 'paypal-usd-source-capture.json', mimeType: 'application/json;charset=utf-8',
      }))}>Download source record</a></p>
      <p><strong>Rounding is a model assumption:</strong> TermShift rounds the percentage component half up for each transaction before adding its fixed fee.
        The cited sources have not been used to confirm that PayPal applies this identical rounding policy. Model totals are not verified real-account charges.</p>
      <p>Fixture dates and contract version numbers identify this reproducible model snapshot; they do not establish a PayPal product launch or fee-change date.</p>
      <p className="case-muted">Independent educational case study. Not affiliated with or endorsed by PayPal. Not financial advice.</p>
    </section>
  </>
}

export default function PayPalCaseStudy() {
  let study: ReturnType<typeof buildPayPalCaseStudy> | undefined
  try {
    study = buildPayPalCaseStudy()
  } catch { /* Render a visible failure below; failed financial inputs never become zero fees. */ }
  return <div className="case-shell">
    <a className="case-skip-link" href="#case-main">Skip to case study</a>
    <header className="case-header"><a className="case-brand" href={base}>TermShift<span>.</span></a><a href={base}>Back to the lab ↗</a></header>
    <main id="case-main" tabIndex={-1}>
      <div className="case-hero"><p className="case-eyebrow">Published-rate case study · locally calculated</p>
        <h1>PayPal USD: two published plans</h1>
        <p>Compare Checkout with the Static Micropayments fee schedule. Trace the public rates into exact integer inputs, inspect independent expectations, and reverify portable evidence.</p>
        <span className="case-status">A / B comparison · source checked {paypalSource.capturedOn}</span>
      </div>
      {study ? <StudyContent study={study} /> : <section className="case-panel case-error" role="alert">
        <h2>Case study unavailable</h2>
        <p>The model or independent reference check failed. Financial results cannot be displayed. Please check the source data and calculation errors.</p>
      </section>}
    </main>
    <footer className="case-footer"><p>TermShift · Financial Contract Counterexample Lab</p><p>Public rates, synthetic scenarios, explicit assumptions.</p><a href={base}>Return to the lab</a></footer>
  </div>
}
