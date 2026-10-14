import type { SearchReport } from '../../search'

export function SearchSummary({ report }: { report: SearchReport }) {
  const stats: ReadonlyArray<readonly [string, string | number]> = [
    ['Search Status', report.status],
    ['Witness Count', report.witnesses.length],
    ['Evaluated Count', report.evaluatedCount],
    ['Successful Evaluations', report.evaluatedCount - report.failedCount],
    ['Skipped Count', report.skippedCount],
    ['Failed Count', report.failedCount],
    ['Evaluation Budget', report.maxEvaluations],
    ['Seed', report.seed],
    ['Base Evaluations', report.sourceEvaluations.base],
    ['Boundary Evaluations', report.sourceEvaluations.boundary],
    ['Seeded Evaluations', report.sourceEvaluations.seeded],
    ['Budget Exhausted', report.budgetExhausted ? 'Yes' : 'No'],
    ['Stop Reason', report.stopReason],
    ['Visited Parameter Combinations', report.coverage.visitedParameterCount],
    ['Generated Parameter Space', report.coverage.generatedSpaceSize],
    ['Parameter Coverage Complete', report.coverage.complete ? 'Yes' : 'No'],
  ]
  return (
    <section className="panel hunter-summary" aria-labelledby="hunter-summary-title">
      <div className="section-heading">
        <div><p className="eyebrow">SearchReport · observed results</p><h2 id="hunter-summary-title">Search Summary</h2></div>
        <span className="status-pill">{report.witnesses.length} retained witnesses</span>
      </div>
      <p role="status" aria-live="polite" aria-atomic="true" className="hunter-search-status">
        {report.status === 'no-witness-found'
          ? 'No counterexample found within the selected search range and budget.'
          : `Found ${report.witnesses.length} retained witnesses after ${report.evaluatedCount} financial comparisons.`}
      </p>
      <dl className="hunter-stats-grid">
        {stats.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
      <div className="hunter-coverage-note">
        <h3>Coverage Information</h3>
        <p>Method: {report.coverage.method}. Scenario family: {report.coverage.scenarioFamily}.</p>
        <p>
          Evaluated Count counts actual financial comparisons, including Failed Count.
          Successful Evaluations excludes those failures. Skipped candidates were not compared;
          visited parameter combinations are a separate measure of traversal.
        </p>
        <p>
          Parameter Coverage Complete describes traversal of this search’s defined parameter combinations.
          It does not establish that every candidate was calculated successfully or cover all possible financial scenarios.
          Retained witnesses are representative cases observed in this run; their differences are not global maxima.
        </p>
      </div>
    </section>
  )
}
