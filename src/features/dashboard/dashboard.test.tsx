// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../App'
import * as engine from '../../engine'
import type { Comparison } from '../../engine'
import {
  experiments,
  gracePeriodShiftExperiment,
  microtransactionPenaltyExperiment,
  waiverTrapExperiment,
} from '../../scenarios'
import type { ExperimentFixture } from '../../scenarios'
import { formatDeltaCents, formatUsdCents } from './format'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function selectExperiment(experiment: ExperimentFixture) {
  fireEvent.change(screen.getByRole('combobox', { name: 'Experiment' }), {
    target: { value: experiment.id },
  })
}

function comparisonFor(experiment: ExperimentFixture): Comparison {
  const result = engine.compareContracts(
    experiment.oldContract,
    experiment.newContract,
    experiment.scenario,
  )
  if (!result.success) throw new Error('Formal experiment did not pass the comparison engine')
  return result.data
}

function expectSummary(oldCost: string, newCost: string, difference: string) {
  for (const [label, value] of [
    ['Old Contract Cost', oldCost],
    ['New Contract Cost', newCost],
    ['Cost Difference', difference],
  ] as const) {
    expect(within(screen.getByRole('article', { name: label })).getByText(value)).toBeTruthy()
  }
}

function freezeData(value: unknown) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return
  for (const child of Object.values(value)) freezeData(child)
  Object.freeze(value)
}

function displayedAmounts(category: HTMLElement) {
  return Array.from(category.querySelectorAll('dd'), (value) => value.firstChild?.textContent?.trim())
}

function expectTraceValue(record: HTMLElement, term: string, value: string | number) {
  const label = within(record).getByText(term, { selector: 'dt' })
  expect(label.parentElement?.querySelector('dd')?.textContent).toBe(String(value))
}

function openCalculationDetails() {
  const summary = screen.getByText('Calculation Details', { selector: 'summary' })
  fireEvent.click(summary)
  const details = summary.parentElement
  if (!(details instanceof HTMLDetailsElement)) throw new Error('Calculation Details is not a native disclosure')
  expect(details.open).toBe(true)
  return details
}

function invalidComparison() {
  return engine.compareContracts(
    waiverTrapExperiment.oldContract,
    waiverTrapExperiment.newContract,
    {
      ...waiverTrapExperiment.scenario,
      transactions: [{
        id: 'invalid-purchase',
        occurredOn: '2026-05-02',
        amountCents: -1,
        kind: 'purchase',
      }],
    },
  )
}

describe('Interactive financial Dashboard', () => {
  it('shows the TermShift brand with the functional analysis screen', () => {
    render(<App />)

    expect(screen.getByLabelText('TermShift').textContent).toContain('TermShift')
    expect(screen.getByRole('combobox', { name: 'Experiment' })).toBeTruthy()
    expect(screen.getByRole('article', { name: 'Cost Difference' })).toBeTruthy()
  })

  it('selects The Waiver Trap by default and exposes all three formal options', () => {
    render(<App />)

    const selector = screen.getByRole('combobox', { name: 'Experiment' }) as HTMLSelectElement
    expect(selector.value).toBe(waiverTrapExperiment.id)
    expect(Array.from(selector.options, (option) => [option.value, option.text])).toEqual(
      experiments.map((experiment) => [experiment.id, experiment.name]),
    )
  })

  it('shows actual default fees and communicates a cost increase with text', () => {
    render(<App />)

    expectSummary('$0.00', '$12.00', '+$12.00')
    expect(screen.getByRole('article', { name: 'Cost Difference' }).textContent).toMatch(/increas/i)
  })

  it('updates every summary cost when selecting The Microtransaction Penalty', () => {
    render(<App />)
    selectExperiment(microtransactionPenaltyExperiment)

    expectSummary('$0.10', '$2.10', '+$2.00')
    expect(screen.queryByText('+$12.00')).toBeNull()
  })

  it('updates every summary cost when selecting The Grace Period Shift', () => {
    render(<App />)
    selectExperiment(gracePeriodShiftExperiment)

    expectSummary('$0.00', '$15.00', '+$15.00')
    expect(screen.queryByText('+$12.00')).toBeNull()
  })

  it('recomputes selections through compareContracts with the unchanged formal inputs', () => {
    const compare = vi.spyOn(engine, 'compareContracts')
    render(<App />)

    for (const experiment of experiments) {
      selectExperiment(experiment)
      expect(compare).toHaveBeenLastCalledWith(
        experiment.oldContract, experiment.newContract, experiment.scenario,
      )
    }
    expect(compare).toHaveBeenCalledTimes(3)
  })

  it.each(experiments)('matches all fee categories to Stage 3 for $name', (experiment) => {
    const comparison = comparisonFor(experiment)
    render(<App />)
    selectExperiment(experiment)

    for (const [label, property] of [
      ['Monthly Fee', 'monthlyFeeCents'],
      ['Transaction Fee', 'transactionFeeCents'],
      ['Late Fee', 'lateFeeCents'],
    ] as const) {
      const category = screen.getByRole('article', { name: label })
      expect(Array.from(category.querySelectorAll('dt'), (term) => term.textContent)).toEqual([
        'Old', 'New', 'Delta',
      ])
      expect(displayedAmounts(category)).toEqual([
        formatUsdCents(comparison.oldEvaluation[property]),
        formatUsdCents(comparison.newEvaluation[property]),
        formatDeltaCents(comparison.deltaByCategoryCents[property]),
      ])
    }
  })

  it('renders the engine’s count and purchase-total waiver traces', () => {
    const comparison = comparisonFor(waiverTrapExperiment)
    render(<App />)
    openCalculationDetails()

    for (const [label, evaluation] of [
      ['Old Contract', comparison.oldEvaluation],
      ['New Contract', comparison.newEvaluation],
    ] as const) {
      const trace = evaluation.trace[0]
      if (trace?.ruleType !== 'monthlyFee') throw new Error('Missing monthly fee trace')
      const section = screen.getByRole('region', { name: `${label} calculation trace` })
      const record = section.querySelector('li')
      if (record === null) throw new Error('Missing monthly trace record')
      expectTraceValue(record, 'Original fee', formatUsdCents(trace.originalFeeCents))
      expectTraceValue(record, 'Threshold', trace.waiverKind === 'minTransactionCount'
        ? trace.threshold : formatUsdCents(trace.threshold))
      expectTraceValue(record, 'Actual value', trace.waiverKind === 'minTransactionCount'
        ? trace.actualTransactionCount : formatUsdCents(trace.actualPurchaseTotalCents))
      expectTraceValue(record, 'Waived', trace.waived ? 'Yes' : 'No')
      expectTraceValue(record, 'Charged', formatUsdCents(trace.chargedCents))
    }
  })

  it('renders every real transaction trace including fixed fees, bps, and rounded fees', () => {
    const comparison = comparisonFor(microtransactionPenaltyExperiment)
    render(<App />)
    selectExperiment(microtransactionPenaltyExperiment)
    openCalculationDetails()

    for (const [label, evaluation] of [
      ['Old Contract', comparison.oldEvaluation],
      ['New Contract', comparison.newEvaluation],
    ] as const) {
      const section = screen.getByRole('region', { name: `${label} calculation trace` })
      const records = Array.from(section.querySelectorAll('li'))
      expect(records).toHaveLength(evaluation.trace.length)
      for (const [index, trace] of evaluation.trace.entries()) {
        if (trace.ruleType !== 'transactionFee') throw new Error('Unexpected nontransaction trace')
        const record = records[index]
        if (record === undefined) throw new Error('Missing transaction trace record')
        expectTraceValue(record, 'Transaction ID', trace.transactionId)
        expectTraceValue(record, 'Amount', formatUsdCents(trace.amountCents))
        expectTraceValue(record, 'Fixed fee', formatUsdCents(trace.fixedCents))
        expectTraceValue(record, 'Rate', `${trace.rateBps} bps`)
        expectTraceValue(record, 'Rounded proportional fee', formatUsdCents(trace.variableFeeCents))
        expectTraceValue(record, 'Charged', formatUsdCents(trace.chargedCents))
      }
    }
  })

  it('renders the original due date, paid date, calendar late days, and grace decisions', () => {
    const comparison = comparisonFor(gracePeriodShiftExperiment)
    render(<App />)
    selectExperiment(gracePeriodShiftExperiment)
    openCalculationDetails()

    for (const [label, evaluation] of [
      ['Old Contract', comparison.oldEvaluation],
      ['New Contract', comparison.newEvaluation],
    ] as const) {
      const trace = evaluation.trace[0]
      if (trace?.ruleType !== 'lateFee') throw new Error('Missing late fee trace')
      const section = screen.getByRole('region', { name: `${label} calculation trace` })
      const record = section.querySelector('li')
      if (record === null) throw new Error('Missing late fee record')
      expectTraceValue(record, 'Payment ID', trace.paymentEventId)
      expectTraceValue(record, 'Due date', trace.dueOn)
      expectTraceValue(record, 'Paid date', trace.paidOn)
      expectTraceValue(record, 'Late days', trace.lateDays)
      expectTraceValue(record, 'Grace days', trace.graceDays)
      expectTraceValue(record, 'Grace exceeded', trace.graceExceeded ? 'Yes' : 'No')
      expectTraceValue(record, 'Charged', formatUsdCents(trace.chargedCents))
    }
  })

  it('lets users expand and collapse the native calculation disclosure', () => {
    render(<App />)
    const summary = screen.getByText('Calculation Details', { selector: 'summary' })
    const details = summary.parentElement
    if (!(details instanceof HTMLDetailsElement)) throw new Error('Missing calculation disclosure')
    expect(details.open).toBe(false)
    fireEvent.click(summary)
    expect(details.open).toBe(true)
    fireEvent.click(summary)
    expect(details.open).toBe(false)
  })

  it('switches among all experiments without mutating frozen formal fixtures', () => {
    const before = JSON.stringify(experiments)
    freezeData(experiments)
    render(<App />)

    for (const experiment of [...experiments, waiverTrapExperiment]) {
      selectExperiment(experiment)
    }

    expect(JSON.stringify(experiments)).toBe(before)
    expect(Object.isFrozen(waiverTrapExperiment.scenario.transactions)).toBe(true)
    expectSummary('$0.00', '$12.00', '+$12.00')
  })

  it('computes every experiment locally without requesting an external API', () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('Dashboard attempted an unexpected network request')
    })
    const request = vi.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation(() => {
      throw new Error('Dashboard attempted an unexpected XMLHttpRequest')
    })
    render(<App />)

    for (const experiment of experiments) selectExperiment(experiment)

    expect(fetch).not.toHaveBeenCalled()
    expect(request).not.toHaveBeenCalled()
    expectSummary('$0.00', '$15.00', '+$15.00')
  })

  it('shows structured engine issues and omits successful financial data after a failure', () => {
    const failure = invalidComparison()
    if (failure.success) throw new Error('Invalid scenario unexpectedly passed validation')
    const issue = failure.issues[0]
    if (issue === undefined) throw new Error('Validation failure has no issue')
    vi.spyOn(engine, 'compareContracts').mockReturnValueOnce(failure)
    render(<App />)

    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain(issue.message)
    expect(alert.textContent).toContain('amountCents')
    expect(screen.queryByRole('article', { name: 'Old Contract Cost' })).toBeNull()
    expect(screen.queryByRole('article', { name: 'New Contract Cost' })).toBeNull()
    expect(screen.queryByRole('article', { name: 'Cost Difference' })).toBeNull()
    expect(screen.queryByText('$0.00')).toBeNull()
  })

  it('recovers from a validation failure by switching to another valid experiment', () => {
    vi.spyOn(engine, 'compareContracts').mockReturnValueOnce(invalidComparison())
    render(<App />)
    expect(screen.getByRole('alert')).toBeTruthy()

    selectExperiment(microtransactionPenaltyExperiment)

    expect(screen.queryByRole('alert')).toBeNull()
    expectSummary('$0.10', '$2.10', '+$2.00')
  })

  it('represents a negative difference using a real comparison with reversed contracts', () => {
    const negative = engine.compareContracts(
      waiverTrapExperiment.newContract,
      waiverTrapExperiment.oldContract,
      waiverTrapExperiment.scenario,
    )
    expect(negative.success).toBe(true)
    vi.spyOn(engine, 'compareContracts').mockReturnValueOnce(negative)
    render(<App />)

    expectSummary('$12.00', '$0.00', '-$12.00')
    expect(screen.getByRole('article', { name: 'Cost Difference' }).textContent).toMatch(/decreas/i)
    expect(screen.getByRole('article', { name: 'Monthly Fee' }).textContent).toContain('-$12.00')
  })

  it('represents an all-zero comparison without invalid chart values', () => {
    const zero = engine.compareContracts(
      waiverTrapExperiment.oldContract,
      waiverTrapExperiment.oldContract,
      waiverTrapExperiment.scenario,
    )
    expect(zero.success).toBe(true)
    vi.spyOn(engine, 'compareContracts').mockReturnValueOnce(zero)
    const { container } = render(<App />)

    expectSummary('$0.00', '$0.00', '$0.00')
    expect(screen.getByRole('article', { name: 'Cost Difference' }).textContent).toMatch(/same|no.*change/i)
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/)
    for (const category of ['Monthly Fee', 'Transaction Fee', 'Late Fee']) {
      expect(displayedAmounts(screen.getByRole('article', { name: category })))
        .toEqual(['$0.00', '$0.00', '$0.00'])
    }
  })

  it('keeps controls native, labelled, and keyboard focusable', () => {
    render(<App />)
    const selector = screen.getByRole('combobox', { name: 'Experiment' })
    expect(selector.tagName).toBe('SELECT')
    expect(selector.hasAttribute('disabled')).toBe(false)
    expect(selector.tabIndex).toBeGreaterThanOrEqual(0)
    selector.focus()
    expect(document.activeElement).toBe(selector)

    const summary = screen.getByText('Calculation Details', { selector: 'summary' })
    summary.focus()
    expect(document.activeElement).toBe(summary)
  })

  it('provides a skip link to the focusable main content', () => {
    render(<App />)
    const skip = screen.getByRole('link', { name: 'Skip to content' })
    expect(skip.getAttribute('href')).toBe('#dashboard')
    const main = screen.getByRole('main')
    expect(main.id).toBe('dashboard')
    main.focus()
    expect(document.activeElement).toBe(main)
  })

  it('announces a compact updated summary without reading the entire transaction trace', () => {
    render(<App />)
    selectExperiment(microtransactionPenaltyExperiment)

    const status = screen.getByRole('status')
    expect(status.textContent).toContain(microtransactionPenaltyExperiment.name)
    expect(status.textContent).toContain('$0.10')
    expect(status.textContent).toContain('$2.10')
    expect(status.textContent).toContain('+$2.00')
    expect(status.textContent).not.toContain('micro-purchase-1')
    expect(status.textContent?.length).toBeLessThan(350)
  })

  it('offers working view buttons without planned-page navigation', () => {
    render(<App />)
    const navigation = screen.getByRole('navigation', { name: 'Main navigation' })
    const dashboard = within(navigation).getByRole('button', { name: 'Dashboard' })
    const financialDiff = within(navigation).getByRole('button', { name: 'Financial Diff' })
    expect(dashboard.getAttribute('aria-current')).toBe('page')
    expect(financialDiff.hasAttribute('disabled')).toBe(false)
    fireEvent.click(financialDiff)
    expect(screen.getByRole('heading', { name: 'Financial Diff', level: 1 })).toBeTruthy()
    expect(financialDiff.getAttribute('aria-current')).toBe('page')
    fireEvent.click(dashboard)
    expect(screen.getByRole('main').id).toBe('dashboard')
    const hunter = screen.getByRole('button', { name: 'Counterexample Hunter' })
    fireEvent.click(hunter)
    expect(screen.getByRole('main').id).toBe('counterexample-hunter')
    expect(hunter.getAttribute('aria-current')).toBe('page')
    const proof = screen.getByRole('button', { name: 'Proof of Impact' })
    fireEvent.click(proof)
    expect(screen.getByRole('main').id).toBe('proof-of-impact')
    expect(proof.getAttribute('aria-current')).toBe('page')
  })
})
