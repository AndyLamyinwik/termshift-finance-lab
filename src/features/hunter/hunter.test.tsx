// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MockInstance } from 'vitest'
import App from '../../App'
import { compareContracts } from '../../engine'
import { calendarDaysBetween } from '../../engine/dates'
import { validateScenario } from '../../models'
import * as search from '../../search'
import type { SearchOptions, SearchReport, Witness } from '../../search'
import {
  experiments, gracePeriodShiftExperiment, microtransactionPenaltyExperiment, waiverTrapExperiment,
} from '../../scenarios'
import type { ExperimentFixture } from '../../scenarios'
import { formatDeltaCents, formatUsdCents } from '../dashboard/format'
import { useWorkspace } from '../workspace/useWorkspace'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const defaults: SearchOptions = {
  seed: 20260401, maxEvaluations: 120, maxResults: 5,
  purchaseCountMin: 0, purchaseCountMax: 10,
  purchaseAmountCentsMin: 100, purchaseAmountCentsMax: 1000,
  lateDaysMin: 0, lateDaysMax: 5,
}

const controlDefaults = [
  ['Seed', '20260401'], ['Max Evaluations', '120'], ['Max Results', '5'],
  ['Purchase Count Min', '0'], ['Purchase Count Max', '10'],
  ['Purchase Amount Min (USD)', '1.00'], ['Purchase Amount Max (USD)', '10.00'],
  ['Late Days Min', '0'], ['Late Days Max', '5'],
] as const

function navigate(name: 'Dashboard' | 'Financial Diff' | 'Counterexample Hunter') {
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Main navigation' }))
    .getByRole('button', { name }))
}

function selectExperiment(experiment: ExperimentFixture) {
  fireEvent.change(screen.getByRole('combobox', { name: 'Experiment' }), {
    target: { value: experiment.id },
  })
}

function openHunter(experiment: ExperimentFixture = waiverTrapExperiment) {
  render(<App />)
  navigate('Counterexample Hunter')
  selectExperiment(experiment)
}

function control(label: string) {
  return within(screen.getByRole('form', { name: 'Search Controls' })).getByLabelText(label) as HTMLInputElement
}

function change(label: string, value: string) {
  fireEvent.change(control(label), { target: { value } })
}

function changeRule(label: string, value: string, side: 'Old Contract' | 'New Contract' = 'New Contract') {
  fireEvent.change(within(screen.getByRole('group', { name: side })).getByLabelText(label), {
    target: { value },
  })
}

function run() {
  fireEvent.click(screen.getByRole('button', { name: 'Run Search' }))
}

function apply() {
  fireEvent.click(screen.getByRole('button', { name: 'Apply Changes' }))
}

function term(label: string, region = 'Search Summary') {
  const definition = within(screen.getByRole('region', { name: region })).getByText(label, { selector: 'dt' })
  return definition.nextElementSibling?.textContent?.trim() ?? ''
}

function reportFrom(spy: MockInstance<typeof search.searchCounterexamples>): SearchReport {
  const result = spy.mock.results.at(-1)?.value as ReturnType<typeof search.searchCounterexamples> | undefined
  if (!result?.success) throw new Error('Expected a successful real search result')
  return result.data
}

function expectSelected(witness: Witness) {
  const selected = screen.getByRole('region', { name: 'Selected Witness' })
  expect(selected.textContent).toContain(witness.candidateId)
  for (const [name, value] of [
    ['Old Contract Cost', formatUsdCents(witness.comparison.oldEvaluation.totalCents)],
    ['New Contract Cost', formatUsdCents(witness.comparison.newEvaluation.totalCents)],
    ['Cost Difference', formatDeltaCents(witness.comparison.deltaCents)],
  ] as const) {
    expect(within(selected).getByRole('article', { name }).textContent).toContain(value)
  }
  for (const [name, key] of [
    ['Monthly Fee', 'monthlyFeeCents'], ['Transaction Fee', 'transactionFeeCents'], ['Late Fee', 'lateFeeCents'],
  ] as const) {
    const article = within(selected).getByRole('article', { name })
    expect(Array.from(article.querySelectorAll('dd'), (entry) => entry.firstChild?.textContent?.trim()))
      .toEqual([
        formatUsdCents(witness.comparison.oldEvaluation[key]),
        formatUsdCents(witness.comparison.newEvaluation[key]),
        formatDeltaCents(witness.comparison.deltaByCategoryCents[key]),
      ])
  }
}

function expectNoReport() {
  expect(screen.queryByRole('region', { name: 'Search Summary' })).toBeNull()
  expect(screen.queryByRole('region', { name: 'Selected Witness' })).toBeNull()
}

function freeze(value: unknown) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return
  for (const child of Object.values(value)) freeze(child)
  Object.freeze(value)
}

describe('Counterexample Hunter navigation and neutral search base', () => {
  it('provides a focusable third view with current-page state and a matching skip target', () => {
    const searchSpy = vi.spyOn(search, 'searchCounterexamples')
    render(<App />)
    const navigation = within(screen.getByRole('navigation', { name: 'Main navigation' }))
    const hunter = navigation.getByRole('button', { name: 'Counterexample Hunter' })
    expect(hunter.tagName).toBe('BUTTON')
    expect(hunter.tabIndex).toBeGreaterThanOrEqual(0)
    hunter.focus()
    expect(document.activeElement).toBe(hunter)
    fireEvent.click(hunter)
    expect(screen.getByRole('heading', { name: 'Counterexample Hunter', level: 1 })).toBeTruthy()
    expect(hunter.getAttribute('aria-current')).toBe('page')
    expect(navigation.getByRole('button', { name: 'Dashboard' }).hasAttribute('aria-current')).toBe(false)
    expect(screen.getByRole('main').id).toBe('counterexample-hunter')
    expect(screen.getByRole('link', { name: 'Skip to content' }).getAttribute('href'))
      .toBe('#counterexample-hunter')
    expect(searchSpy).not.toHaveBeenCalled()
    expectNoReport()
    expect(screen.getByRole('button', { name: 'Proof of Impact' })).toBeTruthy()
    expect(screen.queryByText('Planned')).toBeNull()
  })

  it.each(experiments)('validates an independent neutral base for $name without altering its Dashboard Scenario', (experiment) => {
    const original = JSON.stringify(experiment)
    const searchSpy = vi.spyOn(search, 'searchCounterexamples')
    openHunter(experiment)
    const startingCost = experiment.id === waiverTrapExperiment.id ? '$12.00' : '$0.00'
    expect(term('Starting Old Cost', 'Search Starting Scenario')).toBe(startingCost)
    expect(term('Starting New Cost', 'Search Starting Scenario')).toBe(startingCost)
    expect(term('Starting Cost Difference', 'Search Starting Scenario')).toBe('$0.00')
    expect(screen.getByRole('region', { name: 'Search Starting Scenario' }).textContent)
      .toMatch(/Dashboard.*Scenario|Dashboard scenario/i)
    run()
    const call = searchSpy.mock.lastCall
    if (!call) throw new Error('Search was not called')
    const base = call[2] as typeof experiment.scenario
    expect(base).not.toBe(experiment.scenario)
    expect(validateScenario(base).success).toBe(true)
    expect(base.id).toBe(experiment.scenario.id)
    expect(base.billingMonth).toBe(experiment.scenario.billingMonth)
    expect(base.transactions).toEqual([])
    expect(base.paymentEvents).toEqual(experiment.scenario.paymentEvents.map((payment) => ({
      ...payment, paidOn: payment.dueOn,
    })))
    const comparison = compareContracts(call[0], call[1], base)
    expect(comparison.success).toBe(true)
    if (comparison.success) expect(comparison.data.deltaCents).toBe(0)
    expect(JSON.stringify(experiment)).toBe(original)
    navigate('Dashboard')
    const dashboardComparison = compareContracts(experiment.oldContract, experiment.newContract, experiment.scenario)
    if (!dashboardComparison.success) throw new Error('Expected a valid Dashboard comparison')
    expect(screen.getByRole('article', { name: 'New Contract Cost' }).textContent)
      .toContain(formatUsdCents(dashboardComparison.data.newEvaluation.totalCents))
  })

  it('renders all nine labeled native controls with the documented defaults', () => {
    openHunter()
    for (const [label, value] of controlDefaults) {
      const input = control(label)
      expect(input.tagName).toBe('INPUT')
      expect(input.value).toBe(value)
      expect(input.id.length).toBeGreaterThan(0)
      input.focus()
      expect(document.activeElement).toBe(input)
    }
    const button = screen.getByRole('button', { name: 'Run Search' })
    expect(button.tagName).toBe('BUTTON')
    expect(button.getAttribute('type')).toBe('submit')
  })
})

describe('real Stage 4A searches and selected financial evidence', () => {
  it.each(experiments)('discovers real witnesses and displays the returned report for $name', (experiment) => {
    const searchSpy = vi.spyOn(search, 'searchCounterexamples')
    openHunter(experiment)
    run()
    expect(searchSpy).toHaveBeenCalledTimes(1)
    expect(searchSpy.mock.lastCall?.[3]).toEqual(defaults)
    const report = reportFrom(searchSpy)
    expect(report.status).toBe('witnesses-found')
    expect(report.witnesses.length).toBeGreaterThan(0)
    expect(report.witnesses.length).toBeLessThanOrEqual(defaults.maxResults)
    expect(report.evaluatedCount).toBeLessThanOrEqual(defaults.maxEvaluations)
    for (const [label, expected] of [
      ['Witness Count', report.witnesses.length], ['Evaluated Count', report.evaluatedCount],
      ['Successful Evaluations', report.evaluatedCount - report.failedCount],
      ['Skipped Count', report.skippedCount], ['Failed Count', report.failedCount],
      ['Evaluation Budget', report.maxEvaluations], ['Seed', report.seed],
      ['Base Evaluations', report.sourceEvaluations.base], ['Boundary Evaluations', report.sourceEvaluations.boundary],
      ['Seeded Evaluations', report.sourceEvaluations.seeded],
      ['Visited Parameter Combinations', report.coverage.visitedParameterCount],
      ['Generated Parameter Space', report.coverage.generatedSpaceSize],
    ] as const) expect(term(label).replaceAll(',', '')).toBe(String(expected))
    expect(term('Stop Reason')).toMatch(/budget/i)
    expect(term('Budget Exhausted')).toMatch(/yes|true/i)
    expect(term('Parameter Coverage Complete')).toMatch(/no|false/i)
    const first = report.witnesses[0]
    if (!first) throw new Error('No witness was returned')
    expectSelected(first)
    const comparison = compareContracts(experiment.oldContract, experiment.newContract, first.scenario)
    expect(comparison.success).toBe(true)
    if (comparison.success) expect(first.comparison).toEqual(comparison.data)
    expect(screen.getByRole('region', { name: 'Search Evidence' }).textContent)
      .toContain(String(report.seed))
    expect(screen.getByRole('region', { name: 'Witness Scenario' }).textContent)
      .toContain(first.scenario.billingMonth)
    expect(screen.getByRole('status').textContent).toMatch(/search|witness/i)
  })

  it('retains the Grace Period Shift payment obligation and shows its actual later completion date', () => {
    const searchSpy = vi.spyOn(search, 'searchCounterexamples')
    openHunter(gracePeriodShiftExperiment)
    run()
    const first = reportFrom(searchSpy).witnesses[0]
    if (!first) throw new Error('Expected a late-fee witness')
    expect(first.comparison.deltaByCategoryCents.lateFeeCents).toBe(1500)
    const payment = first.scenario.paymentEvents[0]
    expect(payment?.id).toBe('grace-payment-1')
    expect(payment?.dueOn).toBe('2026-05-15')
    expect(payment?.paidOn).toBe('2026-05-17')
    if (!payment) throw new Error('Missing witness payment')
    expect(calendarDaysBetween(payment.dueOn, payment.paidOn)).toBe(2)
    const details = screen.getByRole('region', { name: 'Witness Scenario' })
    for (const value of [payment.id, payment.dueOn, payment.paidOn, formatUsdCents(payment.amountCents)]) {
      expect(details.textContent).toContain(value)
    }
    expect(term('Starting Cost Difference', 'Search Starting Scenario')).toBe('$0.00')
  })

  it('selects another retained witness without rerunning and displays that witness comparison', () => {
    const searchSpy = vi.spyOn(search, 'searchCounterexamples')
    openHunter(microtransactionPenaltyExperiment)
    run()
    const report = reportFrom(searchSpy)
    const witness = report.witnesses.at(-1)
    if (!witness) throw new Error('Missing retained witness')
    const list = screen.getByRole('region', { name: 'Witness List' })
    const buttons = within(list).getAllByRole('button')
    expect(buttons.length).toBe(report.witnesses.length)
    const selected = within(list).getByRole('button', { name: witness.candidateId })
    selected.focus()
    expect(document.activeElement).toBe(selected)
    fireEvent.click(selected)
    expect(searchSpy).toHaveBeenCalledTimes(1)
    expect(selected.getAttribute('aria-pressed')).toBe('true')
    expect(buttons.filter((button) => button.getAttribute('aria-pressed') === 'true').length).toBe(1)
    expectSelected(witness)
    const scenario = screen.getByRole('region', { name: 'Witness Scenario' })
    for (const transaction of witness.scenario.transactions) {
      expect(scenario.textContent).toContain(transaction.id)
      expect(scenario.textContent).toContain(transaction.occurredOn)
      expect(scenario.textContent).toContain(formatUsdCents(transaction.amountCents))
    }
    const evidence = screen.getByRole('region', { name: 'Search Evidence' })
    expect(evidence.textContent).toContain(witness.source)
    expect(evidence.textContent).toContain(String(witness.sequence))
  })

  it('shows a real negative cost difference and leaves zero differences out of the witness list', () => {
    const searchSpy = vi.spyOn(search, 'searchCounterexamples')
    openHunter()
    change('Purchase Count Max', '4')
    change('Purchase Amount Min (USD)', '125')
    change('Purchase Amount Max (USD)', '200')
    run()
    const report = reportFrom(searchSpy)
    expect(report.witnesses.length).toBeGreaterThan(0)
    expect(report.witnesses.every((witness) => witness.deltaCents < 0)).toBe(true)
    const first = report.witnesses[0]
    if (!first) throw new Error('Missing negative witness')
    expectSelected(first)
    expect(screen.getByRole('article', { name: 'Cost Difference' }).textContent).toMatch(/decreas/i)
    expect(term('Starting Cost Difference', 'Search Starting Scenario')).toBe('$0.00')
  })

  it('reproduces the complete report with the same seed and passes a changed seed to the real API', () => {
    const searchSpy = vi.spyOn(search, 'searchCounterexamples')
    openHunter()
    change('Seed', '321')
    run()
    const first = structuredClone(reportFrom(searchSpy))
    run()
    expect(reportFrom(searchSpy)).toEqual(first)
    change('Seed', '654')
    expectNoReport()
    run()
    expect(searchSpy.mock.lastCall?.[3]).toEqual({ ...defaults, seed: 654 })
    const changed = reportFrom(searchSpy)
    expect(changed.seed).toBe(654)
    expect(changed.candidates.filter((candidate) => candidate.source === 'seeded'))
      .not.toEqual(first.candidates.filter((candidate) => candidate.source === 'seeded'))
  })

  it('enforces the chosen financial-call budget and retained-result limit', () => {
    const searchSpy = vi.spyOn(search, 'searchCounterexamples')
    openHunter()
    change('Max Evaluations', '12')
    change('Max Results', '2')
    run()
    const report = reportFrom(searchSpy)
    expect(report.evaluatedCount).toBeLessThanOrEqual(12)
    expect(report.witnesses.length).toBeLessThanOrEqual(2)
    expect(searchSpy.mock.lastCall?.[3]).toEqual({ ...defaults, maxEvaluations: 12, maxResults: 2 })
    expect(term('Evaluation Budget')).toBe('12')
    expect(term('Budget Exhausted')).toMatch(/yes|true/i)
  })

  it('accepts the maximum documented settings and preserves their exact units in the API call', () => {
    const searchSpy = vi.spyOn(search, 'searchCounterexamples')
    openHunter()
    change('Seed', '4294967295')
    change('Max Evaluations', '500')
    change('Max Results', '10')
    change('Purchase Count Max', '30')
    change('Purchase Amount Max (USD)', '1000.00')
    change('Late Days Max', '31')
    run()
    expect(searchSpy.mock.lastCall?.[3]).toEqual({
      ...defaults, seed: 4294967295, maxEvaluations: 500, maxResults: 10,
      purchaseCountMax: 30, purchaseAmountCentsMax: 100000, lateDaysMax: 31,
    })
    const report = reportFrom(searchSpy)
    expect(report.evaluatedCount).toBeLessThanOrEqual(500)
    expect(report.witnesses.length).toBeLessThanOrEqual(10)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('reports the precise bounded-search message when a one-evaluation budget finds no witness', () => {
    const searchSpy = vi.spyOn(search, 'searchCounterexamples')
    openHunter()
    change('Max Evaluations', '1')
    run()
    const report = reportFrom(searchSpy)
    expect(report.evaluatedCount).toBe(1)
    expect(report.witnesses).toEqual([])
    expect(screen.getByText('No counterexample found within the selected search range and budget.')).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Selected Witness' })).toBeNull()
    expect(term('Budget Exhausted')).toMatch(/yes|true/i)
    expect(document.body.textContent).not.toMatch(/financially equivalent|globally optimal|maximum impact proven/i)
  })
})

describe('applied working contracts and search invalidation', () => {
  it('searches the applied edited contracts instead of the original fixture', () => {
    const searchSpy = vi.spyOn(search, 'searchCounterexamples')
    openHunter(microtransactionPenaltyExperiment)
    run()
    expect(reportFrom(searchSpy).witnesses.length).toBeGreaterThan(0)
    navigate('Financial Diff')
    changeRule('Fixed fee (USD)', '0')
    changeRule('Rate (bps)', '100')
    apply()
    navigate('Counterexample Hunter')
    expectNoReport()
    run()
    const updated = searchSpy.mock.lastCall?.[1] as typeof microtransactionPenaltyExperiment.newContract
    expect(updated.rules.transactionFee).toEqual({ fixedCents: 0, rateBps: 100 })
    expect(updated).not.toEqual(microtransactionPenaltyExperiment.newContract)
    expect(reportFrom(searchSpy).witnesses).toEqual([])
    expect(screen.getByText('No counterexample found within the selected search range and budget.')).toBeTruthy()
    expect(microtransactionPenaltyExperiment.newContract.rules.transactionFee).toEqual({ fixedCents: 20, rateBps: 60 })
  })

  it('displays an actual nonzero starting difference after modifying applied monthly fees', () => {
    openHunter()
    navigate('Financial Diff')
    changeRule('Monthly fee (USD)', '7')
    apply()
    navigate('Counterexample Hunter')
    expect(term('Starting Old Cost', 'Search Starting Scenario')).toBe('$12.00')
    expect(term('Starting New Cost', 'Search Starting Scenario')).toBe('$7.00')
    expect(term('Starting Cost Difference', 'Search Starting Scenario')).toBe('-$5.00')
  })

  it('preserves the previous report when raw Financial Diff drafts have not been applied', () => {
    const searchSpy = vi.spyOn(search, 'searchCounterexamples')
    openHunter()
    run()
    const initial = structuredClone(reportFrom(searchSpy))
    navigate('Financial Diff')
    changeRule('Monthly fee (USD)', '999')
    navigate('Counterexample Hunter')
    expect(document.body.textContent).toMatch(/last applied working contracts/i)
    expect(document.body.textContent).toMatch(/drafts are excluded/i)
    expect(term('Witness Count')).toBe(String(initial.witnesses.length))
    expectSelected(initial.witnesses[0]!)
    expect(searchSpy).toHaveBeenCalledTimes(1)
    run()
    expect(searchSpy.mock.lastCall?.[1]).toEqual(waiverTrapExperiment.newContract)
    expect(reportFrom(searchSpy)).toEqual(initial)
  })

  it('preserves the report after an invalid Apply that does not change the working contracts', () => {
    const searchSpy = vi.spyOn(search, 'searchCounterexamples')
    openHunter()
    run()
    const initial = reportFrom(searchSpy)
    navigate('Financial Diff')
    changeRule('Monthly fee (USD)', 'NaN')
    apply()
    expect(screen.getByRole('alert')).toBeTruthy()
    navigate('Counterexample Hunter')
    expect(term('Evaluated Count')).toBe(String(initial.evaluatedCount))
    expectSelected(initial.witnesses[0]!)
    expect(searchSpy).toHaveBeenCalledTimes(1)
  })

  it('invalidates the report and selected witness on Apply and Reset to Original', () => {
    openHunter()
    run()
    navigate('Financial Diff')
    changeRule('Monthly fee (USD)', '7')
    apply()
    navigate('Counterexample Hunter')
    expectNoReport()
    run()
    expect(screen.getByRole('region', { name: 'Selected Witness' })).toBeTruthy()
    navigate('Financial Diff')
    fireEvent.click(screen.getByRole('button', { name: 'Reset to Original' }))
    navigate('Counterexample Hunter')
    expectNoReport()
    expect(term('Starting Cost Difference', 'Search Starting Scenario')).toBe('$0.00')
  })

  it.each(controlDefaults)('invalidates old results when the %s setting changes', (label, original) => {
    openHunter()
    run()
    const updated = label.includes('Amount') ? '2.00' : original === '0' ? '1' : String(Number(original) + 1)
    change(label, updated)
    expectNoReport()
    expect(control(label).value).toBe(updated)
  })

  it('resets settings, results and the neutral base when a different experiment is selected', () => {
    openHunter()
    change('Seed', '123')
    run()
    selectExperiment(gracePeriodShiftExperiment)
    expectNoReport()
    for (const [label, value] of controlDefaults) expect(control(label).value).toBe(value)
    expect(screen.getByRole('region', { name: 'Search Starting Scenario' }).textContent)
      .toContain('2026-05-15')
    expect(term('Starting Cost Difference', 'Search Starting Scenario')).toBe('$0.00')
  })

  it('keeps settings, report and selected witness across navigation and same-experiment selection', () => {
    const searchSpy = vi.spyOn(search, 'searchCounterexamples')
    openHunter()
    change('Seed', '456')
    run()
    const report = reportFrom(searchSpy)
    const witness = report.witnesses.at(-1)!
    fireEvent.click(within(screen.getByRole('region', { name: 'Witness List' }))
      .getByRole('button', { name: witness.candidateId }))
    navigate('Dashboard')
    navigate('Financial Diff')
    navigate('Counterexample Hunter')
    selectExperiment(waiverTrapExperiment)
    expect(control('Seed').value).toBe('456')
    expectSelected(witness)
    expect(searchSpy).toHaveBeenCalledTimes(1)
  })

  it('returns to the initial in-memory state on remount without browser storage', () => {
    const setStorage = vi.spyOn(Storage.prototype, 'setItem')
    const getStorage = vi.spyOn(Storage.prototype, 'getItem')
    const view = render(<App />)
    navigate('Counterexample Hunter')
    change('Seed', '77')
    run()
    view.unmount()
    render(<App />)
    navigate('Counterexample Hunter')
    expectNoReport()
    expect(control('Seed').value).toBe('20260401')
    expect(setStorage).not.toHaveBeenCalled()
    expect(getStorage).not.toHaveBeenCalled()
  })

  it('retains a complete detached search snapshot for later evidence views without coupling it to working drafts', () => {
    const searchSpy = vi.spyOn(search, 'searchCounterexamples')
    const { result } = renderHook(() => useWorkspace())
    act(() => result.current.runSearch())
    const snapshot = result.current.searchSnapshot
    if (!snapshot || !result.current.searchBase.success) throw new Error('Expected a valid search snapshot')
    expect(snapshot.oldContract).toEqual(result.current.workingOldContract)
    expect(snapshot.newContract).toEqual(result.current.workingNewContract)
    expect(snapshot.oldContract).not.toBe(result.current.workingOldContract)
    expect(snapshot.newContract).not.toBe(result.current.workingNewContract)
    expect(snapshot.oldContract.rules).not.toBe(result.current.workingOldContract.rules)
    expect(snapshot.newContract.rules).not.toBe(result.current.workingNewContract.rules)
    expect(snapshot.baseScenario).toEqual(result.current.searchBase.data)
    expect(snapshot.baseScenario).not.toBe(result.current.searchBase.data)
    expect(snapshot.baseScenario.transactions).not.toBe(result.current.searchBase.data.transactions)
    expect(snapshot.searchOptions).toEqual(defaults)
    expect(snapshot.searchReport).toEqual(reportFrom(searchSpy))
    expect(snapshot.selectedWitnessId).toBe(snapshot.searchReport.witnesses[0]?.candidateId)
    const saved = JSON.stringify(snapshot)
    const draft = structuredClone(result.current.draftNewContract)
    if (!draft.monthlyFee) throw new Error('Missing editable monthly fee')
    draft.monthlyFee.feeUsd = '999'
    act(() => result.current.updateDraft('new', draft))
    expect(JSON.stringify(result.current.searchSnapshot)).toBe(saved)
    expect(result.current.hasUnappliedChanges).toBe(true)
    const witness = snapshot.searchReport.witnesses.at(-1)!
    act(() => result.current.selectWitness(witness.candidateId))
    expect(result.current.searchSnapshot?.selectedWitnessId).toBe(witness.candidateId)
    expect(result.current.searchSnapshot?.searchReport).toBe(snapshot.searchReport)
    const validSelection = result.current.searchSnapshot
    act(() => result.current.selectWitness('not-a-retained-witness'))
    expect(result.current.searchSnapshot).toBe(validSelection)
    expect(searchSpy).toHaveBeenCalledTimes(1)
    act(() => result.current.updateSearchDraft('seed', '17'))
    expect(result.current.searchSnapshot).toBeNull()
    expect(snapshot.selectedWitnessId).toBe(snapshot.searchReport.witnesses[0]?.candidateId)
    expect(JSON.stringify(snapshot)).toBe(saved)
  })
})

describe('search input failures and report interpretation', () => {
  it.each([
    ['Seed', ''], ['Seed', '-1'], ['Seed', '4294967296'], ['Seed', '1e3'],
    ['Max Evaluations', '0'], ['Max Evaluations', '501'], ['Max Evaluations', '2.5'],
    ['Max Results', '0'], ['Max Results', '11'],
    ['Purchase Count Min', '-1'], ['Purchase Count Max', '31'],
    ['Purchase Amount Min (USD)', '0'], ['Purchase Amount Min (USD)', '-1'],
    ['Purchase Amount Min (USD)', 'NaN'], ['Purchase Amount Min (USD)', 'Infinity'],
    ['Purchase Amount Min (USD)', '0.001'], ['Purchase Amount Min (USD)', '1e2'],
    ['Purchase Amount Max (USD)', '1000.01'], ['Purchase Amount Max (USD)', '90071992547409.92'],
    ['Late Days Min', '-1'], ['Late Days Max', '32'], ['Late Days Max', '1.5'],
  ])('rejects invalid %s input %s before calling the search engine', (label, raw) => {
    const searchSpy = vi.spyOn(search, 'searchCounterexamples')
    openHunter()
    change(label, raw)
    run()
    expect(searchSpy).not.toHaveBeenCalled()
    expectNoReport()
    const input = control(label)
    expect(input.value).toBe(raw)
    expect(input.getAttribute('aria-invalid')).toBe('true')
    const descriptions = input.getAttribute('aria-describedby')?.split(/\s+/) ?? []
    expect(descriptions.some((id) => Boolean(document.getElementById(id)?.textContent?.trim()))).toBe(true)
    expect(screen.getByRole('alert').textContent).toMatch(/search|invalid|correct/i)
  })

  it.each([
    ['Purchase Count Min', 'Purchase Count Max', '11'],
    ['Purchase Amount Min (USD)', 'Purchase Amount Max (USD)', '11.00'],
    ['Late Days Min', 'Late Days Max', '6'],
  ])('rejects reversed %s / %s bounds without silently widening the range', (minimum, maximum, value) => {
    const searchSpy = vi.spyOn(search, 'searchCounterexamples')
    openHunter()
    change(minimum, value)
    const previousMaximum = control(maximum).value
    run()
    expect(searchSpy).not.toHaveBeenCalled()
    expect(control(minimum).value).toBe(value)
    expect(control(maximum).value).toBe(previousMaximum)
    expect(control(maximum).getAttribute('aria-invalid')).toBe('true')
  })

  it('accepts zero seed, count and delay together with the exact one-cent lower amount bound', () => {
    const searchSpy = vi.spyOn(search, 'searchCounterexamples')
    openHunter()
    change('Seed', '0')
    change('Purchase Amount Min (USD)', '0.01')
    run()
    expect(searchSpy.mock.lastCall?.[3]).toEqual({ ...defaults, seed: 0, purchaseAmountCentsMin: 1 })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('clears old financial evidence and renders structured search failures without invented zero totals', () => {
    const searchSpy = vi.spyOn(search, 'searchCounterexamples')
    openHunter()
    run()
    expect(screen.getByRole('region', { name: 'Selected Witness' })).toBeTruthy()
    searchSpy.mockReturnValueOnce({
      success: false,
      issues: [{ code: 'overflow', path: ['newContract', 'rules', 'monthlyFee'], message: 'Synthetic verification overflow' }],
    })
    run()
    expectNoReport()
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('Synthetic verification overflow')
    expect(alert.textContent).toContain('overflow')
    expect(alert.textContent).toContain('newContract.rules.monthlyFee')
    expect(screen.queryByRole('article', { name: 'Old Contract Cost' })).toBeNull()
  })

  it('distinguishes failed calls from successful evaluations and qualifies complete parameter coverage', () => {
    const searchSpy = vi.spyOn(search, 'searchCounterexamples')
    openHunter()
    run()
    const original = reportFrom(searchSpy)
    searchSpy.mockReturnValueOnce({ success: true, data: {
      ...original, failedCount: 2, skippedCount: 3,
      coverage: { ...original.coverage, complete: true, visitedParameterCount: 120, generatedSpaceSize: 120 },
    } })
    run()
    expect(term('Evaluated Count')).toBe('120')
    expect(term('Successful Evaluations')).toBe('118')
    expect(term('Failed Count')).toBe('2')
    expect(term('Skipped Count')).toBe('3')
    expect(term('Parameter Coverage Complete')).toMatch(/yes|true/i)
    const summary = screen.getByRole('region', { name: 'Search Summary' })
    expect(summary.textContent).toMatch(/failed|failure/i)
    expect(summary.textContent).toMatch(/parameter/i)
    expect(summary.textContent).toMatch(/does not establish that every candidate was calculated successfully/i)
    expect(summary.textContent).toMatch(/all possible financial scenarios/i)
    expect(summary.textContent).toMatch(/observed|representative/i)
  })

  it('reports real failed financial comparisons caused by applied safe amounts overflowing candidate totals', () => {
    const searchSpy = vi.spyOn(search, 'searchCounterexamples')
    openHunter(microtransactionPenaltyExperiment)
    navigate('Financial Diff')
    changeRule('Fixed fee (USD)', '90071992547409.91')
    changeRule('Rate (bps)', '0')
    apply()
    navigate('Counterexample Hunter')
    change('Purchase Count Max', '3')
    change('Max Evaluations', '12')
    run()
    const report = reportFrom(searchSpy)
    expect(report.failedCount).toBeGreaterThan(0)
    expect(report.evaluatedCount).toBeLessThanOrEqual(12)
    expect(term('Failed Count')).toBe(String(report.failedCount))
    expect(term('Successful Evaluations')).toBe(String(report.evaluatedCount - report.failedCount))
    expect(term('Evaluated Count')).toBe(String(report.evaluatedCount))
    expect(report.candidates.some((candidate) => candidate.status === 'comparison_failed'
      && candidate.issues?.some((issue) => issue.code === 'overflow'))).toBe(true)
  })

  it('derives list quantities from actual nonuniform transactions rather than candidate parameters', () => {
    const searchSpy = vi.spyOn(search, 'searchCounterexamples')
    openHunter(microtransactionPenaltyExperiment)
    run()
    const original = reportFrom(searchSpy)
    const first = original.witnesses[0]!
    const scenario = structuredClone(first.scenario)
    scenario.transactions = [
      { id: 'nonuniform-one', occurredOn: '2026-05-03', amountCents: 111, kind: 'purchase' },
      { id: 'nonuniform-two', occurredOn: '2026-05-08', amountCents: 999, kind: 'purchase' },
    ]
    const comparison = compareContracts(microtransactionPenaltyExperiment.oldContract, microtransactionPenaltyExperiment.newContract, scenario)
    if (!comparison.success) throw new Error('Nonuniform scenario must remain valid')
    const witness: Witness = {
      ...first, candidateId: 'nonuniform-witness', scenario, comparison: comparison.data,
      deltaCents: comparison.data.deltaCents,
      parameters: { purchaseCount: 30, purchaseAmountCents: 100000, lateDays: 0 },
    }
    searchSpy.mockReturnValueOnce({ success: true, data: { ...original, witnesses: [witness] } })
    run()
    const list = screen.getByRole('region', { name: 'Witness List' })
    expect(list.textContent).toContain('$11.10')
    expect(list.textContent).not.toContain('$30,000.00')
    expectSelected(witness)
    const scenarioRegion = screen.getByRole('region', { name: 'Witness Scenario' })
    expect(scenarioRegion.textContent).toContain('$1.11')
    expect(scenarioRegion.textContent).toContain('$9.99')
  })

  it('keeps the candidate ledger out of the DOM and renders only the selected witness scenario', () => {
    const searchSpy = vi.spyOn(search, 'searchCounterexamples')
    openHunter()
    run()
    const original = reportFrom(searchSpy)
    searchSpy.mockReturnValueOnce({ success: true, data: {
      ...original,
      candidates: Array.from({ length: 1500 }, (_, sequence) => ({
        candidateId: `diagnostic-ledger-${sequence}`, sequence, source: 'seeded', status: 'duplicate',
      })),
    } })
    run()
    expect(document.body.textContent).not.toContain('diagnostic-ledger-')
    expect(within(screen.getByRole('region', { name: 'Witness List' })).getAllByRole('button').length)
      .toBe(original.witnesses.length)
    expect(screen.getAllByRole('region', { name: 'Witness Scenario' }).length).toBe(1)
    expect(document.body.querySelectorAll('*').length).toBeLessThan(1500)
  })

  it('runs entirely locally without network calls or mutation of the imported fixtures', () => {
    const fixtureBefore = JSON.stringify(experiments)
    for (const experiment of experiments) freeze(experiment)
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const xhr = vi.spyOn(XMLHttpRequest.prototype, 'open')
    openHunter()
    for (const experiment of experiments) {
      selectExperiment(experiment)
      run()
      expect(screen.getByRole('region', { name: 'Search Summary' })).toBeTruthy()
    }
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(xhr).not.toHaveBeenCalled()
    expect(JSON.stringify(experiments)).toBe(fixtureBefore)
  })
})
