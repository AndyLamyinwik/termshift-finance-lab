// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../App'
import * as engine from '../../engine'
import type { Comparison } from '../../engine'
import type { Contract } from '../../models'
import {
  experiments,
  gracePeriodShiftExperiment,
  microtransactionPenaltyExperiment,
  waiverTrapExperiment,
} from '../../scenarios'
import type { ExperimentFixture } from '../../scenarios'
import { formatDeltaCents, formatUsdCents } from '../dashboard/format'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

type ContractSide = 'Old Contract' | 'New Contract'

function navigate(view: 'Dashboard' | 'Financial Diff') {
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Main navigation' }))
    .getByRole('button', { name: view }))
}

function openDiff(experiment: ExperimentFixture = waiverTrapExperiment) {
  render(<App />)
  navigate('Financial Diff')
  selectExperiment(experiment)
}

function selectExperiment(experiment: ExperimentFixture) {
  fireEvent.change(screen.getByRole('combobox', { name: 'Experiment' }), {
    target: { value: experiment.id },
  })
}

function editor(side: ContractSide) {
  return within(screen.getByRole('group', { name: side }))
}

function field(label: string, side: ContractSide = 'New Contract') {
  return editor(side).getByLabelText(label) as HTMLInputElement | HTMLSelectElement
}

function change(label: string, value: string, side: ContractSide = 'New Contract') {
  fireEvent.change(field(label, side), { target: { value } })
}

function apply() {
  fireEvent.click(screen.getByRole('button', { name: 'Apply Changes' }))
}

function reset() {
  fireEvent.click(screen.getByRole('button', { name: 'Reset to Original' }))
}

function expectSummary(oldCost: string, newCost: string, difference: string) {
  for (const [name, value] of [
    ['Old Contract Cost', oldCost],
    ['New Contract Cost', newCost],
    ['Cost Difference', difference],
  ] as const) {
    expect(within(screen.getByRole('article', { name })).getByText(value)).toBeTruthy()
  }
}

function compareData(oldContract: Contract, newContract: Contract, experiment: ExperimentFixture): Comparison {
  const comparison = engine.compareContracts(oldContract, newContract, experiment.scenario)
  if (!comparison.success) throw new Error('Expected a successful real financial comparison')
  return comparison.data
}

function expectComparison(comparison: Comparison) {
  expectSummary(
    formatUsdCents(comparison.oldEvaluation.totalCents),
    formatUsdCents(comparison.newEvaluation.totalCents),
    formatDeltaCents(comparison.deltaCents),
  )
  for (const [name, category] of [
    ['Monthly Fee', 'monthlyFeeCents'],
    ['Transaction Fee', 'transactionFeeCents'],
    ['Late Fee', 'lateFeeCents'],
  ] as const) {
    const article = screen.getByRole('article', { name })
    expect(Array.from(article.querySelectorAll('dd'), (value) => value.firstChild?.textContent?.trim()))
      .toEqual([
        formatUsdCents(comparison.oldEvaluation[category]),
        formatUsdCents(comparison.newEvaluation[category]),
        formatDeltaCents(comparison.deltaByCategoryCents[category]),
      ])
  }
}

function expectFieldError(label: string, side: ContractSide = 'New Contract') {
  const control = field(label, side)
  expect(control.getAttribute('aria-invalid')).toBe('true')
  const descriptionIds = control.getAttribute('aria-describedby')?.split(/\s+/) ?? []
  expect(descriptionIds.length).toBeGreaterThan(0)
  expect(descriptionIds.some((id) => Boolean(document.getElementById(id)?.textContent?.trim())))
    .toBe(true)
  expect(screen.getByRole('alert').textContent).toMatch(/last.*applied|previous.*applied/i)
}

function freeze(value: unknown) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return
  for (const child of Object.values(value)) freeze(child)
  Object.freeze(value)
}

describe('Financial Diff navigation and shared workspace', () => {
  it('provides native focusable view navigation, the current page, and a matching skip target', () => {
    render(<App />)
    const navigation = within(screen.getByRole('navigation', { name: 'Main navigation' }))
    const dashboard = navigation.getByRole('button', { name: 'Dashboard' })
    const diff = navigation.getByRole('button', { name: 'Financial Diff' })
    expect(dashboard.getAttribute('aria-current')).toBe('page')
    expect(diff.tagName).toBe('BUTTON')
    expect(diff.tabIndex).toBeGreaterThanOrEqual(0)
    diff.focus()
    expect(document.activeElement).toBe(diff)
    fireEvent.click(diff)
    expect(screen.getByRole('heading', { name: 'Financial Diff', level: 1 })).toBeTruthy()
    expect(diff.getAttribute('aria-current')).toBe('page')
    expect(dashboard.hasAttribute('aria-current')).toBe(false)
    const main = screen.getByRole('main')
    expect(main.id).toBe('financial-diff')
    expect(screen.getByRole('link', { name: 'Skip to content' }).getAttribute('href'))
      .toBe('#financial-diff')
    main.focus()
    expect(document.activeElement).toBe(main)
    fireEvent.click(dashboard)
    expect(screen.getByRole('main').id).toBe('dashboard')
  })

  it.each(experiments)('uses the real default comparison and same Scenario for $name', (experiment) => {
    const expected = compareData(experiment.oldContract, experiment.newContract, experiment)
    const compare = vi.spyOn(engine, 'compareContracts')
    openDiff(experiment)
    expectComparison(expected)
    const call = compare.mock.lastCall
    if (call === undefined) throw new Error('The workspace never called compareContracts')
    expect(call[0]).toEqual(experiment.oldContract)
    expect(call[1]).toEqual(experiment.newContract)
    expect(call[0]).not.toBe(experiment.oldContract)
    expect(call[1]).not.toBe(experiment.newContract)
    expect(call[2]).toBe(experiment.scenario)
  })

  it('retains unapplied raw inputs across view changes without running the financial engine', () => {
    const compare = vi.spyOn(engine, 'compareContracts')
    openDiff()
    compare.mockClear()
    for (const value of ['', '5', '50.', '50.00']) change('Monthly purchase total (USD)', value)
    expect(compare).not.toHaveBeenCalled()
    expectSummary('$0.00', '$12.00', '+$12.00')
    navigate('Dashboard')
    expectSummary('$0.00', '$12.00', '+$12.00')
    navigate('Financial Diff')
    expect(field('Monthly purchase total (USD)').value).toBe('50.00')
    expect(compare).not.toHaveBeenCalled()
    apply()
    expect(compare).toHaveBeenCalledTimes(1)
    expectSummary('$0.00', '$0.00', '$0.00')
  })

  it('retains applied work and updated Dashboard terms across view navigation', () => {
    const compare = vi.spyOn(engine, 'compareContracts')
    openDiff()
    change('Monthly purchase total (USD)', '50')
    apply()
    compare.mockClear()
    navigate('Dashboard')
    expectSummary('$0.00', '$0.00', '$0.00')
    expect(screen.getByRole('article', { name: 'New Contract terms' }).textContent)
      .toContain('$50.00 in monthly purchases')
    navigate('Financial Diff')
    expectSummary('$0.00', '$0.00', '$0.00')
    expect(field('Monthly purchase total (USD)').value).toMatch(/^50(?:\.00)?$/)
    expect(compare).not.toHaveBeenCalled()
  })

  it('discards applied changes and invalid drafts when another experiment is selected', () => {
    openDiff()
    change('Monthly purchase total (USD)', '50')
    apply()
    change('Monthly fee (USD)', 'NaN')
    apply()
    expectFieldError('Monthly fee (USD)')
    selectExperiment(microtransactionPenaltyExperiment)
    expect(screen.queryByRole('alert')).toBeNull()
    expectSummary('$0.10', '$2.10', '+$2.00')
    selectExperiment(waiverTrapExperiment)
    expect(field('Monthly purchase total (USD)').value).toBe('500.00')
    expect(field('Monthly fee (USD)').value).toBe('12.00')
    expectSummary('$0.00', '$12.00', '+$12.00')
  })

  it('restores original in-memory state when the application is remounted', () => {
    const view = render(<App />)
    navigate('Financial Diff')
    change('Monthly purchase total (USD)', '50')
    apply()
    expectSummary('$0.00', '$0.00', '$0.00')
    view.unmount()
    render(<App />)
    expectSummary('$0.00', '$12.00', '+$12.00')
    navigate('Financial Diff')
    expect(field('Monthly purchase total (USD)').value).toBe('500.00')
  })

  it('explains temporary storage, experiment draft discard, and future interface limitations', () => {
    openDiff()
    expect(document.body.textContent).toMatch(/memory|in-memory/i)
    expect(document.body.textContent).toMatch(/discard|clear/i)
    expect(document.body.textContent).toMatch(/Working Draft|Modified/i)
    expect(screen.getByRole('button', { name: 'Counterexample Hunter' })).toBeTruthy()
    for (const name of ['Proof of Impact']) {
      expect(screen.queryByRole('button', { name })).toBeNull()
      const heading = screen.getByRole('heading', { name, level: 2 })
      expect(heading.parentElement?.textContent).toContain('Planned')
    }
  })
})

describe('Financial Diff applies validated existing rules', () => {
  it('uses the formal Waiver Trap Scenario when the new waiver changes to $50 and then $60', () => {
    const compare = vi.spyOn(engine, 'compareContracts')
    openDiff()
    compare.mockClear()
    change('Monthly purchase total (USD)', '50')
    expect(compare).not.toHaveBeenCalled()
    apply()
    expectSummary('$0.00', '$0.00', '$0.00')
    expect(screen.getByRole('article', { name: 'Cost Difference' }).textContent).toMatch(/same/i)
    expect(compare.mock.lastCall?.[2]).toBe(waiverTrapExperiment.scenario)
    change('Monthly purchase total (USD)', '60')
    apply()
    expectSummary('$0.00', '$12.00', '+$12.00')
    expect(compare.mock.lastCall?.[2]).toBe(waiverTrapExperiment.scenario)
    expect(compare).toHaveBeenCalledTimes(2)
  })

  it('edits both contracts atomically and displays a real negative difference', () => {
    const oldContract = structuredClone(waiverTrapExperiment.oldContract)
    const newContract = structuredClone(waiverTrapExperiment.newContract)
    if (!oldContract.rules.monthlyFee || !newContract.rules.monthlyFee) throw new Error('Missing monthly rules')
    oldContract.rules.monthlyFee.feeCents = 3000
    oldContract.rules.monthlyFee.waiver.threshold = 6
    newContract.rules.monthlyFee.feeCents = 700
    const expected = compareData(oldContract, newContract, waiverTrapExperiment)
    const compare = vi.spyOn(engine, 'compareContracts')
    openDiff()
    change('Monthly fee (USD)', '30', 'Old Contract')
    change('Minimum purchases (count)', '6', 'Old Contract')
    change('Monthly fee (USD)', '7')
    apply()
    expect(compare).toHaveBeenLastCalledWith(oldContract, newContract, waiverTrapExperiment.scenario)
    expectComparison(expected)
    expectSummary('$30.00', '$7.00', '-$23.00')
    expect(screen.getByRole('article', { name: 'Cost Difference' }).textContent).toMatch(/decreas/i)
  })

  it('recalculates modified fixed transaction fees and rates through Stage 3 per-purchase rounding', () => {
    const newContract = structuredClone(microtransactionPenaltyExperiment.newContract)
    if (!newContract.rules.transactionFee) throw new Error('Missing transaction rule')
    newContract.rules.transactionFee.fixedCents = 33
    newContract.rules.transactionFee.rateBps = 150
    const expected = compareData(microtransactionPenaltyExperiment.oldContract, newContract, microtransactionPenaltyExperiment)
    const compare = vi.spyOn(engine, 'compareContracts')
    openDiff(microtransactionPenaltyExperiment)
    change('Fixed fee (USD)', '0.33')
    change('Rate (bps)', '150')
    apply()
    expect(compare).toHaveBeenLastCalledWith(
      microtransactionPenaltyExperiment.oldContract, newContract, microtransactionPenaltyExperiment.scenario,
    )
    expectComparison(expected)
    expectSummary('$0.10', '$3.50', '+$3.40')
    navigate('Dashboard')
    expectComparison(expected)
  })

  it('changes grace days without changing payment dates or the Scenario', () => {
    const payments = structuredClone(gracePeriodShiftExperiment.scenario.paymentEvents)
    const compare = vi.spyOn(engine, 'compareContracts')
    openDiff(gracePeriodShiftExperiment)
    change('Grace period (days)', '3')
    apply()
    expectSummary('$0.00', '$0.00', '$0.00')
    expect(compare.mock.lastCall?.[2]).toBe(gracePeriodShiftExperiment.scenario)
    expect(gracePeriodShiftExperiment.scenario.paymentEvents).toEqual(payments)
    change('Late fee (USD)', '2.75', 'Old Contract')
    change('Grace period (days)', '0', 'Old Contract')
    apply()
    expectSummary('$2.75', '$0.00', '-$2.75')
  })

  it('switches the new monthly waiver kind and validates the newly labelled threshold', () => {
    const compare = vi.spyOn(engine, 'compareContracts')
    openDiff()
    compare.mockClear()
    change('Waiver condition', 'minTransactionCount')
    expect(editor('New Contract').queryByLabelText('Monthly purchase total (USD)')).toBeNull()
    change('Minimum purchases (count)', '5')
    expect(compare).not.toHaveBeenCalled()
    apply()
    expectSummary('$0.00', '$0.00', '$0.00')
    const newContract = compare.mock.lastCall?.[1] as Contract
    expect(newContract.rules.monthlyFee?.waiver).toEqual({ kind: 'minTransactionCount', threshold: 5 })
  })

  it('switches the old monthly waiver from a count to an exact purchase-total amount', () => {
    const compare = vi.spyOn(engine, 'compareContracts')
    openDiff()
    change('Waiver condition', 'minPurchaseTotalCents', 'Old Contract')
    change('Monthly purchase total (USD)', '50.01', 'Old Contract')
    apply()
    expectSummary('$12.00', '$12.00', '$0.00')
    const oldContract = compare.mock.lastCall?.[0] as Contract
    expect(oldContract.rules.monthlyFee?.waiver).toEqual({ kind: 'minPurchaseTotalCents', threshold: 5001 })
  })

  it.each([
    [waiverTrapExperiment, ['Monthly fee (USD)', 'Waiver condition'], ['Fixed fee (USD)', 'Late fee (USD)']],
    [microtransactionPenaltyExperiment, ['Fixed fee (USD)', 'Rate (bps)'], ['Monthly fee (USD)', 'Late fee (USD)']],
    [gracePeriodShiftExperiment, ['Late fee (USD)', 'Grace period (days)'], ['Monthly fee (USD)', 'Fixed fee (USD)']],
  ] as const)('exposes only existing rule fields for %s', (experiment, present, absent) => {
    openDiff(experiment)
    for (const side of ['Old Contract', 'New Contract'] as const) {
      for (const label of present) expect(editor(side).getByLabelText(label)).toBeTruthy()
      for (const label of absent) expect(editor(side).queryByLabelText(label)).toBeNull()
    }
    expect(screen.queryByRole('button', { name: /add.*rule|delete.*rule|remove.*rule/i })).toBeNull()
    expect(screen.queryByLabelText(/currency|contract id|effective date|version/i)).toBeNull()
  })

  it('preserves decimal USD fee cents without float multiplication errors', () => {
    const compare = vi.spyOn(engine, 'compareContracts')
    openDiff()
    change('Monthly fee (USD)', '0.29')
    apply()
    expectSummary('$0.00', '$0.29', '+$0.29')
    expect((compare.mock.lastCall?.[1] as Contract).rules.monthlyFee?.feeCents).toBe(29)
  })

  it('preserves the maximum safe cents amount exactly through the UI and engine', () => {
    const compare = vi.spyOn(engine, 'compareContracts')
    openDiff()
    change('Monthly fee (USD)', '90071992547409.91')
    apply()
    expect((compare.mock.lastCall?.[1] as Contract).rules.monthlyFee?.feeCents)
      .toBe(Number.MAX_SAFE_INTEGER)
    expectSummary('$0.00', '$90,071,992,547,409.91', '+$90,071,992,547,409.91')
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('Financial Diff rejects invalid drafts and reports engine failures', () => {
  it.each(['', '-1', '1.001', 'NaN', 'Infinity', '1e3', '$12.00', '1,000.00', '90071992547409.92'])(
    'rejects invalid USD input %j without replacing working contracts or calling the engine', (value) => {
      const compare = vi.spyOn(engine, 'compareContracts')
      openDiff()
      compare.mockClear()
      change('Monthly fee (USD)', value)
      apply()
      expectFieldError('Monthly fee (USD)')
      expect(field('Monthly fee (USD)').value).toBe(value)
      expect(compare).not.toHaveBeenCalled()
      expectSummary('$0.00', '$12.00', '+$12.00')
      navigate('Dashboard')
      expectSummary('$0.00', '$12.00', '+$12.00')
      expect(compare).not.toHaveBeenCalled()
    })

  it.each(['-1', '60.5', '10001', '1e2'])('rejects an invalid basis-point rate %j', (value) => {
    const compare = vi.spyOn(engine, 'compareContracts')
    openDiff(microtransactionPenaltyExperiment)
    compare.mockClear()
    change('Rate (bps)', value)
    apply()
    expectFieldError('Rate (bps)')
    expect(compare).not.toHaveBeenCalled()
    expectSummary('$0.10', '$2.10', '+$2.00')
  })

  it.each(['0', '-1', '5.5', '9007199254740992'])('rejects an invalid purchase-count threshold %j', (value) => {
    openDiff()
    change('Minimum purchases (count)', value, 'Old Contract')
    apply()
    expectFieldError('Minimum purchases (count)', 'Old Contract')
    expectSummary('$0.00', '$12.00', '+$12.00')
  })

  it.each(['-1', '1.5', 'Infinity'])('rejects an invalid grace-day count %j', (value) => {
    openDiff(gracePeriodShiftExperiment)
    change('Grace period (days)', value)
    apply()
    expectFieldError('Grace period (days)')
    expectSummary('$0.00', '$15.00', '+$15.00')
  })

  it('rejects a zero-dollar waiver threshold while allowing zero fee amounts', () => {
    const compare = vi.spyOn(engine, 'compareContracts')
    openDiff()
    compare.mockClear()
    change('Monthly fee (USD)', '0')
    change('Monthly purchase total (USD)', '0')
    apply()
    expectFieldError('Monthly purchase total (USD)')
    expect(compare).not.toHaveBeenCalled()
    change('Monthly purchase total (USD)', '1')
    apply()
    expectSummary('$0.00', '$0.00', '$0.00')
  })

  it('keeps both applied contracts unchanged if either draft is invalid', () => {
    const compare = vi.spyOn(engine, 'compareContracts')
    openDiff()
    compare.mockClear()
    change('Monthly fee (USD)', '30', 'Old Contract')
    change('Minimum purchases (count)', '', 'Old Contract')
    change('Monthly purchase total (USD)', '50')
    apply()
    expect(compare).not.toHaveBeenCalled()
    expectFieldError('Minimum purchases (count)', 'Old Contract')
    expect(field('Monthly fee (USD)', 'Old Contract').value).toBe('30')
    expect(field('Monthly purchase total (USD)').value).toBe('50')
    expectSummary('$0.00', '$12.00', '+$12.00')
    navigate('Dashboard')
    expect(screen.getByRole('article', { name: 'Old Contract terms' }).textContent).toContain('$12.00')
    expect(screen.getByRole('article', { name: 'New Contract terms' }).textContent).toContain('$500.00')
  })

  it('revalidates a corrected draft and clears field errors only after a valid application', () => {
    openDiff()
    change('Monthly purchase total (USD)', '')
    apply()
    expectFieldError('Monthly purchase total (USD)')
    change('Monthly purchase total (USD)', '50')
    apply()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(field('Monthly purchase total (USD)').getAttribute('aria-invalid')).not.toBe('true')
    expectSummary('$0.00', '$0.00', '$0.00')
  })

  it('resets both applied contracts, unsubmitted inputs, and validation errors to the formal experiment', () => {
    openDiff()
    change('Monthly fee (USD)', '25', 'Old Contract')
    change('Minimum purchases (count)', '6', 'Old Contract')
    change('Monthly purchase total (USD)', '50')
    apply()
    expectSummary('$25.00', '$0.00', '-$25.00')
    change('Monthly fee (USD)', 'Infinity')
    apply()
    expectFieldError('Monthly fee (USD)')
    reset()
    expectSummary('$0.00', '$12.00', '+$12.00')
    expect(field('Monthly fee (USD)', 'Old Contract').value).toBe('12.00')
    expect(field('Minimum purchases (count)', 'Old Contract').value).toBe('5')
    expect(field('Monthly fee (USD)').value).toBe('12.00')
    expect(field('Monthly purchase total (USD)').value).toBe('500.00')
    expect(screen.queryByRole('alert')).toBeNull()
    navigate('Dashboard')
    expectSummary('$0.00', '$12.00', '+$12.00')
  })

  it('shows actual structured overflow issues without zero-valued success results and can recover', () => {
    const newContract = structuredClone(microtransactionPenaltyExperiment.newContract)
    if (!newContract.rules.transactionFee) throw new Error('Missing transaction rule')
    newContract.rules.transactionFee.fixedCents = Number.MAX_SAFE_INTEGER
    const failure = engine.compareContracts(
      microtransactionPenaltyExperiment.oldContract, newContract, microtransactionPenaltyExperiment.scenario,
    )
    if (failure.success) throw new Error('Expected transaction sum overflow')
    openDiff(microtransactionPenaltyExperiment)
    change('Fixed fee (USD)', '90071992547409.91')
    apply()
    const alert = screen.getByRole('alert')
    for (const issue of failure.issues) {
      expect(alert.textContent).toContain(issue.code)
      expect(alert.textContent).toContain(issue.message)
      if (issue.path.length > 0) expect(alert.textContent).toContain(issue.path.join('.'))
    }
    expect(screen.queryByRole('article', { name: 'Cost Difference' })).toBeNull()
    expect(screen.queryByRole('article', { name: 'Old Contract Cost' })).toBeNull()
    expect(screen.queryByRole('article', { name: 'New Contract Cost' })).toBeNull()
    navigate('Dashboard')
    expect(screen.getByRole('alert').textContent).toContain('overflow')
    expect(screen.queryByRole('article', { name: 'Cost Difference' })).toBeNull()
    navigate('Financial Diff')
    reset()
    expect(screen.queryByRole('alert')).toBeNull()
    expectSummary('$0.10', '$2.10', '+$2.00')
  })
})

describe('Financial Diff local and immutable input boundaries', () => {
  it('does not mutate deeply frozen fixtures while editing, applying, resetting, or selecting', () => {
    const before = JSON.stringify(experiments)
    freeze(experiments)
    openDiff()
    change('Monthly purchase total (USD)', '50')
    change('Monthly fee (USD)', '0.29', 'Old Contract')
    apply()
    reset()
    selectExperiment(microtransactionPenaltyExperiment)
    change('Fixed fee (USD)', '0.07')
    apply()
    selectExperiment(gracePeriodShiftExperiment)
    change('Grace period (days)', '3')
    apply()
    expect(JSON.stringify(experiments)).toBe(before)
  })

  it('edits all experiments without fetch, XMLHttpRequest, or persistence writes', () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('Unexpected runtime API request')
    })
    const request = vi.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation(() => {
      throw new Error('Unexpected XMLHttpRequest')
    })
    const storage = vi.spyOn(Storage.prototype, 'setItem')
    openDiff()
    change('Monthly purchase total (USD)', '50')
    apply()
    selectExperiment(microtransactionPenaltyExperiment)
    change('Fixed fee (USD)', '0.05')
    apply()
    selectExperiment(gracePeriodShiftExperiment)
    change('Grace period (days)', '3')
    apply()
    reset()
    expect(fetch).not.toHaveBeenCalled()
    expect(request).not.toHaveBeenCalled()
    expect(storage).not.toHaveBeenCalled()
  })

  it('uses labelled native fields and a semantic form for keyboard submission', () => {
    openDiff()
    const amount = field('Monthly purchase total (USD)')
    amount.focus()
    expect(document.activeElement).toBe(amount)
    expect(amount.tagName).toBe('INPUT')
    expect(amount.getAttribute('type')).toBe('text')
    expect(amount.tabIndex).toBeGreaterThanOrEqual(0)
    expect(field('Waiver condition').tagName).toBe('SELECT')
    const applyButton = screen.getByRole('button', { name: 'Apply Changes' })
    const resetButton = screen.getByRole('button', { name: 'Reset to Original' })
    expect(applyButton.tagName).toBe('BUTTON')
    expect(resetButton.tagName).toBe('BUTTON')
    applyButton.focus()
    expect(document.activeElement).toBe(applyButton)
    change('Monthly purchase total (USD)', '50')
    const form = applyButton.closest('form')
    if (form === null) throw new Error('Apply Changes must belong to a semantic form')
    fireEvent.submit(form)
    expectSummary('$0.00', '$0.00', '$0.00')
  })
})
