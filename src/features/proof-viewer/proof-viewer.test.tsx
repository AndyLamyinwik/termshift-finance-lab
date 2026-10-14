// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MockInstance } from 'vitest'
import App from '../../App'
import { compareContracts } from '../../engine'
import { calendarDaysBetween } from '../../engine/dates'
import * as proofApi from '../../proof'
import type { ImpactProof } from '../../proof'
import {
  experiments, gracePeriodShiftExperiment, microtransactionPenaltyExperiment, waiverTrapExperiment,
} from '../../scenarios'
import type { ExperimentFixture } from '../../scenarios'
import * as searchApi from '../../search'
import type { SearchReport } from '../../search'
import { formatDeltaCents, formatUsdCents } from '../dashboard/format'
import { useWorkspace } from '../workspace/useWorkspace'
import { paymentDelayLabel, purchaseTotalLabel } from './scenarioPresentation'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

type ViewName = 'Dashboard' | 'Financial Diff' | 'Counterexample Hunter' | 'Proof of Impact'

function navigate(name: ViewName) {
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Main navigation' })).getByRole('button', { name }))
}

function selectExperiment(experiment: ExperimentFixture) {
  fireEvent.change(screen.getByRole('combobox', { name: 'Experiment' }), { target: { value: experiment.id } })
}

function changeSearch(label: string, value: string) {
  fireEvent.change(within(screen.getByRole('form', { name: 'Search Controls' })).getByLabelText(label), { target: { value } })
}

function changeRule(label: string, value: string, side: 'Old Contract' | 'New Contract' = 'New Contract') {
  fireEvent.change(within(screen.getByRole('group', { name: side })).getByLabelText(label), { target: { value } })
}

function changeBudget(value: string) {
  fireEvent.change(screen.getByRole('textbox', { name: 'Max Checks' }), { target: { value } })
}

function openSelectedProof(experiment: ExperimentFixture = microtransactionPenaltyExperiment) {
  render(<App />)
  navigate('Counterexample Hunter')
  selectExperiment(experiment)
  fireEvent.click(screen.getByRole('button', { name: 'Run Search' }))
  navigate('Proof of Impact')
}

function generate() {
  fireEvent.click(screen.getByRole('button', { name: 'Generate Proof' }))
}

function term(label: string, region = 'Verification Overview', role: 'region' | 'article' = 'region') {
  const definition = within(screen.getByRole(role, { name: region })).getByText(label, { selector: 'dt' })
  return definition.nextElementSibling?.textContent?.trim() ?? ''
}

function proofFrom(spy: MockInstance<typeof proofApi.createImpactProof>): ImpactProof {
  const result = spy.mock.results.at(-1)?.value as ReturnType<typeof proofApi.createImpactProof> | undefined
  if (!result?.success) throw new Error('Expected a real generated ImpactProof')
  return result.data
}

function reportFrom(spy: MockInstance<typeof searchApi.searchCounterexamples>): SearchReport {
  const result = spy.mock.results.at(-1)?.value as ReturnType<typeof searchApi.searchCounterexamples> | undefined
  if (!result?.success) throw new Error('Expected a real search report')
  return result.data
}

function expectIdle() {
  expect(screen.queryByText('Verified', { exact: true })).toBeNull()
  expect(screen.queryByRole('region', { name: 'Verification Overview' })).toBeNull()
  expect(screen.queryByRole('region', { name: 'Before / After Comparison' })).toBeNull()
  expect(screen.getByText('Verification Status: Not generated')).toBeTruthy()
}

function expectProof(proof: ImpactProof) {
  const verified = proofApi.verifyImpactProof(proof)
  if (!verified.success) throw new Error(JSON.stringify(verified.issues))
  for (const [label, value] of [
    ['Verification Status', 'Verified'], ['Verified Comparisons', verified.data.verifiedComparisons],
    ['Proof Schema Version', proof.proofSchemaVersion], ['Engine Version', proof.engineVersion],
    ['Minimizer Version', proof.minimizerVersion], ['Old Contract ID', proof.oldContract.id],
    ['New Contract ID', proof.newContract.id], ['Witness Candidate ID', proof.witnessSource.candidateId],
    ['Witness Source', proof.witnessSource.source], ['Search Seed', proof.searchOptions.seed],
    ['Original Cost Difference', formatDeltaCents(proof.originalComparison.deltaCents)],
    ['Minimized Cost Difference', formatDeltaCents(proof.minimizedComparison.deltaCents)],
    ['Checks Performed', proof.minimizationBudget.checksPerformed], ['Max Checks', proof.minimizationBudget.maxChecks],
    ['Budget Exhausted', proof.minimizationBudget.budgetExhausted ? 'Yes' : 'No'],
    ['Termination Reason', proof.minimizationBudget.terminationReason],
  ] as const) expect(term(label)).toBe(String(value))
  for (const [label, scenario, comparison] of [
    ['Original Witness', proof.originalScenario, proof.originalComparison],
    ['Minimized Witness', proof.minimizedScenario, proof.minimizedComparison],
  ] as const) {
    expect(term('Purchase Count', label, 'article')).toBe(String(scenario.transactions.length))
    expect(term('Purchase Total', label, 'article')).toBe(purchaseTotalLabel(scenario))
    expect(term('Payment Event Count', label, 'article')).toBe(String(scenario.paymentEvents.length))
    expect(term('Payment Delay Summary', label, 'article')).toBe(paymentDelayLabel(scenario))
    expect(term('Old Contract Total', label, 'article')).toBe(formatUsdCents(comparison.oldEvaluation.totalCents))
    expect(term('New Contract Total', label, 'article')).toBe(formatUsdCents(comparison.newEvaluation.totalCents))
    expect(term('Signed Delta', label, 'article')).toContain(formatDeltaCents(comparison.deltaCents))
  }
}

function freeze(value: unknown) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return
  Object.values(value).forEach(freeze)
  Object.freeze(value)
}

describe('Proof of Impact navigation and explicit generation', () => {
  it('enables all four native navigation buttons with the proof skip target and an actionable empty state', () => {
    const create = vi.spyOn(proofApi, 'createImpactProof')
    const verify = vi.spyOn(proofApi, 'verifyImpactProof')
    render(<App />)
    const navigation = within(screen.getByRole('navigation', { name: 'Main navigation' }))
    expect(navigation.getAllByRole('button').map((item) => item.textContent)).toEqual([
      'Dashboard', 'Financial Diff', 'Counterexample Hunter', 'Proof of Impact',
    ])
    const button = navigation.getByRole('button', { name: 'Proof of Impact' })
    button.focus()
    expect(document.activeElement).toBe(button)
    fireEvent.click(button)
    expect(button.tagName).toBe('BUTTON')
    expect(button.getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('main').id).toBe('proof-of-impact')
    expect(screen.getByRole('main').tabIndex).toBe(-1)
    expect(screen.getByRole('link', { name: 'Skip to content' }).getAttribute('href')).toBe('#proof-of-impact')
    expect(screen.getByRole('heading', { name: 'Proof of Impact', level: 1 })).toBeTruthy()
    expect(screen.getByText('No witness selected. Run a counterexample search and select a witness first.')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Generate Proof' }) as HTMLButtonElement).disabled).toBe(true)
    generate()
    expect(create).not.toHaveBeenCalled()
    expect(verify).not.toHaveBeenCalled()
    expectIdle()
    fireEvent.click(screen.getByRole('button', { name: 'Go to Counterexample Hunter' }))
    expect(screen.getByRole('heading', { name: 'Counterexample Hunter', level: 1 })).toBeTruthy()
  })

  it('remains empty after a real no-witness search', () => {
    const create = vi.spyOn(proofApi, 'createImpactProof')
    render(<App />)
    navigate('Counterexample Hunter')
    changeSearch('Purchase Count Max', '4')
    fireEvent.click(screen.getByRole('button', { name: 'Run Search' }))
    expect(screen.getByText('No counterexample found within the selected search range and budget.')).toBeTruthy()
    navigate('Proof of Impact')
    expect((screen.getByRole('button', { name: 'Generate Proof' }) as HTMLButtonElement).disabled).toBe(true)
    expectIdle()
    expect(create).not.toHaveBeenCalled()
  })

  it('calls real creation then a separate fresh verifier only on explicit submission', () => {
    const create = vi.spyOn(proofApi, 'createImpactProof')
    const verify = vi.spyOn(proofApi, 'verifyImpactProof')
    const search = vi.spyOn(searchApi, 'searchCounterexamples')
    openSelectedProof()
    expect(create).not.toHaveBeenCalled()
    expect(verify).not.toHaveBeenCalled()
    expect((screen.getByRole('textbox', { name: 'Max Checks' }) as HTMLInputElement).value).toBe('200')
    expect(term('Witness Candidate ID', 'Selected Witness')).toBe(reportFrom(search).witnesses[0]?.candidateId)
    fireEvent.submit(screen.getByRole('form', { name: 'Minimization Controls' }))
    expect(create).toHaveBeenCalledTimes(1)
    expect(verify).toHaveBeenCalledTimes(1)
    expect(create.mock.invocationCallOrder[0]).toBeLessThan(verify.mock.invocationCallOrder[0]!)
    expect(create.mock.lastCall?.[4]).toEqual({ maxChecks: 200 })
    const proof = proofFrom(create)
    expect(verify.mock.lastCall?.[0]).toBe(proof)
    for (const view of ['Dashboard', 'Financial Diff', 'Counterexample Hunter', 'Proof of Impact'] as const) navigate(view)
    expect(create).toHaveBeenCalledTimes(1)
    expect(verify).toHaveBeenCalledTimes(1)
    expect(term('Verification Status')).toBe('Verified')
    expect(reportFrom(search).witnesses[0]?.comparison).toEqual(proof.originalComparison)
  })

  it.each(experiments)('generates and verifies real Stage 4A / Stage 4B evidence for $name', (experiment) => {
    const create = vi.spyOn(proofApi, 'createImpactProof')
    openSelectedProof(experiment)
    generate()
    const proof = proofFrom(create)
    expectProof(proof)
    expect(proof.originalComparison.deltaCents).not.toBe(0)
    expect(proof.minimizedComparison.deltaCents).not.toBe(0)
    expect(Math.sign(proof.minimizedComparison.deltaCents)).toBe(Math.sign(proof.originalComparison.deltaCents))
    const comparison = compareContracts(proof.oldContract, proof.newContract, proof.minimizedScenario)
    expect(comparison).toEqual({ success: true, data: proof.minimizedComparison })
    if (experiment.id === waiverTrapExperiment.id) {
      expect(proof.minimizedScenario.transactions.length).toBe(5)
      expect(proof.minimizedComparison.deltaByCategoryCents.monthlyFeeCents).toBe(1200)
    } else if (experiment.id === microtransactionPenaltyExperiment.id) {
      expect(proof.originalScenario.transactions.length).toBe(10)
      expect(proof.minimizedScenario.transactions.length).toBe(1)
      expect(proof.originalComparison.deltaCents).toBe(200)
      expect(proof.minimizedComparison.deltaCents).toBe(20)
      expect(term('Payment Event Count', 'Minimized Witness', 'article')).toBe('0')
      expect(term('Payment Delay Summary', 'Minimized Witness', 'article')).toBe('No payment events')
    } else {
      expect(proof.originalScenario.transactions.length).toBeGreaterThan(0)
      expect(proof.minimizedScenario.transactions.length).toBe(0)
      expect(proof.minimizedScenario.paymentEvents).toHaveLength(1)
      const payment = proof.minimizedScenario.paymentEvents[0]!
      expect(payment.id).toBe(experiment.scenario.paymentEvents[0]?.id)
      expect(payment.dueOn).toBe('2026-05-15')
      expect(calendarDaysBetween(payment.dueOn, payment.paidOn)).toBe(2)
      expect(proof.minimizedComparison.deltaByCategoryCents.lateFeeCents).toBe(1500)
      expect(term('Purchase Total', 'Minimized Witness', 'article')).toBe('$0.00')
    }
  })

  it('generates a negative-delta proof from a real search while preserving its direction', () => {
    const create = vi.spyOn(proofApi, 'createImpactProof')
    render(<App />)
    navigate('Counterexample Hunter')
    changeSearch('Purchase Count Max', '4')
    changeSearch('Purchase Amount Min (USD)', '125.00')
    changeSearch('Purchase Amount Max (USD)', '200.00')
    fireEvent.click(screen.getByRole('button', { name: 'Run Search' }))
    navigate('Proof of Impact')
    generate()
    const proof = proofFrom(create)
    expectProof(proof)
    expect(proof.originalComparison.deltaCents).toBe(-1200)
    expect(proof.minimizedComparison.deltaCents).toBe(-1200)
    expect(term('Signed Delta', 'Minimized Witness', 'article')).toContain('-$12.00')
  })

  it('displays real cross-month payment dates without timestamp assumptions', () => {
    const create = vi.spyOn(proofApi, 'createImpactProof')
    render(<App />)
    navigate('Counterexample Hunter')
    selectExperiment(gracePeriodShiftExperiment)
    changeSearch('Late Days Min', '20')
    changeSearch('Late Days Max', '21')
    fireEvent.click(screen.getByRole('button', { name: 'Run Search' }))
    // Both original grace windows are exceeded, so make the applied old grace window 25 days.
    navigate('Financial Diff')
    changeRule('Grace period (days)', '25', 'Old Contract')
    fireEvent.click(screen.getByRole('button', { name: 'Apply Changes' }))
    navigate('Counterexample Hunter')
    fireEvent.click(screen.getByRole('button', { name: 'Run Search' }))
    navigate('Proof of Impact')
    generate()
    const proof = proofFrom(create)
    expectProof(proof)
    expect(proof.originalScenario.paymentEvents[0]?.paidOn.startsWith('2026-06')).toBe(true)
    expect(term('Payment Delay Summary', 'Original Witness', 'article')).toContain('paid 2026-06-')
    expect(proof.minimizedScenario.paymentEvents[0]?.dueOn).toBe('2026-05-15')
  })
})

describe('bounded minimization controls', () => {
  it.each(['1', '200', '300'])('uses valid maxChecks %s through the real formal API', (value) => {
    const create = vi.spyOn(proofApi, 'createImpactProof')
    openSelectedProof()
    changeBudget(value)
    generate()
    const proof = proofFrom(create)
    expect(create.mock.lastCall?.[4]).toEqual({ maxChecks: Number(value) })
    expect(proof.minimizationBudget.maxChecks).toBe(Number(value))
    expect(proof.minimizationBudget.checksPerformed).toBeLessThanOrEqual(Number(value))
    expect(term('Verification Status')).toBe('Verified')
  })

  it.each([
    '', '0', '301', '-1', '1.5', 'NaN', 'Infinity', '1e2', ' 200', '200 ', '0200', '0x10', '9007199254740992',
  ])('rejects invalid maxChecks %j with an accessible error without calling proof APIs', (value) => {
      const create = vi.spyOn(proofApi, 'createImpactProof')
      const verify = vi.spyOn(proofApi, 'verifyImpactProof')
      openSelectedProof()
      changeBudget(value)
      generate()
      expect(create).not.toHaveBeenCalled()
      expect(verify).not.toHaveBeenCalled()
      const input = screen.getByRole('textbox', { name: 'Max Checks' })
      expect(input.getAttribute('aria-invalid')).toBe('true')
      const errorId = input.getAttribute('aria-describedby')?.split(' ').at(-1)
      expect(errorId).toBeTruthy()
      expect(document.getElementById(errorId!)?.textContent).toBeTruthy()
      expect(screen.getByRole('alert').textContent).toContain('Unable to generate proof')
      expectIdle()
    })

  it('maxChecks=1 verifies unchanged evidence and accurately reports exhausted budget with no accepted steps', () => {
    const create = vi.spyOn(proofApi, 'createImpactProof')
    openSelectedProof()
    changeBudget('1')
    generate()
    const proof = proofFrom(create)
    expect(proof.minimizedScenario).toEqual(proof.originalScenario)
    expect(proof.reductionSteps).toEqual([])
    expect(term('Checks Performed')).toBe('1')
    expect(term('Budget Exhausted')).toBe('Yes')
    expect(term('Termination Reason')).toBe('budget-exhausted')
    expect(screen.getByText('No accepted reduction steps under the selected strategy and budget.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Show More' })).toBeNull()
    expect(term('Verification Status')).toBe('Verified')
  })

  it('a budget edit clears prior proof but keeps the selected search witness until explicitly regenerated', () => {
    const create = vi.spyOn(proofApi, 'createImpactProof')
    openSelectedProof()
    generate()
    const id = term('Witness Candidate ID')
    changeBudget('100')
    expectIdle()
    expect(term('Witness Candidate ID', 'Selected Witness')).toBe(id)
    expect(create).toHaveBeenCalledTimes(1)
    generate()
    expect(term('Max Checks')).toBe('100')
  })

  it('the same budget text preserves a verified proof', () => {
    openSelectedProof()
    generate()
    changeBudget('200')
    expect(term('Verification Status')).toBe('Verified')
  })
})

describe('proof snapshot validity', () => {
  it('uses saved applied contracts when unapplied Financial Diff text exists before generation', () => {
    const create = vi.spyOn(proofApi, 'createImpactProof')
    openSelectedProof(waiverTrapExperiment)
    navigate('Financial Diff')
    changeRule('Monthly fee (USD)', '7.00')
    navigate('Proof of Impact')
    expect(screen.getByText(/Unapplied Financial Diff drafts are excluded/)).toBeTruthy()
    generate()
    expect(create.mock.lastCall?.[1]).toEqual(waiverTrapExperiment.newContract)
    expect(proofFrom(create).minimizedComparison.deltaCents).toBe(1200)
  })

  it('preserves an existing proof through pending drafts and an invalid Apply', () => {
    const create = vi.spyOn(proofApi, 'createImpactProof')
    const verify = vi.spyOn(proofApi, 'verifyImpactProof')
    openSelectedProof(waiverTrapExperiment)
    generate()
    navigate('Financial Diff')
    changeRule('Monthly fee (USD)', 'invalid')
    fireEvent.click(screen.getByRole('button', { name: 'Apply Changes' }))
    navigate('Proof of Impact')
    expect(term('Verification Status')).toBe('Verified')
    expect(term('Minimized Cost Difference')).toBe('+$12.00')
    expect(create).toHaveBeenCalledTimes(1)
    expect(verify).toHaveBeenCalledTimes(1)
  })

  it('applied modifications invalidate old evidence and the next proof uses the new actual search snapshot', () => {
    const create = vi.spyOn(proofApi, 'createImpactProof')
    openSelectedProof(waiverTrapExperiment)
    generate()
    navigate('Financial Diff')
    changeRule('Monthly fee (USD)', '7.00')
    fireEvent.click(screen.getByRole('button', { name: 'Apply Changes' }))
    navigate('Proof of Impact')
    expectIdle()
    expect((screen.getByRole('button', { name: 'Generate Proof' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Go to Counterexample Hunter' }))
    fireEvent.click(screen.getByRole('button', { name: 'Run Search' }))
    navigate('Proof of Impact')
    generate()
    expect(proofFrom(create).newContract.rules.monthlyFee?.feeCents).toBe(700)
    expect(proofFrom(create).minimizedComparison.deltaCents).toBe(700)
    expect(term('Minimized Cost Difference')).toBe('+$7.00')
  })

  it('Reset to Original clears proof, witness and minimization budget state', () => {
    openSelectedProof()
    changeBudget('100')
    generate()
    navigate('Financial Diff')
    fireEvent.click(screen.getByRole('button', { name: 'Reset to Original' }))
    navigate('Proof of Impact')
    expectIdle()
    expect((screen.getByRole('textbox', { name: 'Max Checks' }) as HTMLInputElement).value).toBe('200')
    expect(screen.queryByRole('region', { name: 'Selected Witness' })).toBeNull()
  })

  it('switching experiments clears all proof validity state', () => {
    openSelectedProof()
    generate()
    selectExperiment(gracePeriodShiftExperiment)
    expectIdle()
    expect(screen.queryByRole('region', { name: 'Selected Witness' })).toBeNull()
  })

  it('the same experiment, witness and navigation preserve the exact evidence without API calls', () => {
    const create = vi.spyOn(proofApi, 'createImpactProof')
    const verify = vi.spyOn(proofApi, 'verifyImpactProof')
    openSelectedProof()
    generate()
    const id = term('Witness Candidate ID')
    selectExperiment(microtransactionPenaltyExperiment)
    navigate('Counterexample Hunter')
    fireEvent.click(screen.getByRole('button', { name: id }))
    navigate('Proof of Impact')
    expect(term('Verification Status')).toBe('Verified')
    expect(create).toHaveBeenCalledTimes(1)
    expect(verify).toHaveBeenCalledTimes(1)
  })

  it('selecting another witness removes the old Verified status and generates evidence for the new candidate', () => {
    const search = vi.spyOn(searchApi, 'searchCounterexamples')
    const create = vi.spyOn(proofApi, 'createImpactProof')
    openSelectedProof()
    generate()
    const next = reportFrom(search).witnesses[1]!
    navigate('Counterexample Hunter')
    fireEvent.click(screen.getByRole('button', { name: next.candidateId }))
    navigate('Proof of Impact')
    expectIdle()
    expect(term('Witness Candidate ID', 'Selected Witness')).toBe(next.candidateId)
    generate()
    expect(proofFrom(create).witnessSource.candidateId).toBe(next.candidateId)
    expect(term('Verification Status')).toBe('Verified')
  })

  it('rerunning the same search invalidates prior proof even when the first witness is identical', () => {
    openSelectedProof()
    generate()
    const id = term('Witness Candidate ID')
    navigate('Counterexample Hunter')
    fireEvent.click(screen.getByRole('button', { name: 'Run Search' }))
    navigate('Proof of Impact')
    expectIdle()
    expect(term('Witness Candidate ID', 'Selected Witness')).toBe(id)
  })

  it.each([
    ['Seed', '20260402'], ['Max Evaluations', '100'], ['Max Results', '4'],
    ['Purchase Count Min', '1'], ['Purchase Count Max', '9'],
    ['Purchase Amount Min (USD)', '2.00'], ['Purchase Amount Max (USD)', '9.00'],
    ['Late Days Min', '1'], ['Late Days Max', '4'],
  ])('changing %s clears both saved search and proof instead of leaving a Verified badge', (label, value) => {
    openSelectedProof()
    generate()
    navigate('Counterexample Hunter')
    changeSearch(label, value)
    navigate('Proof of Impact')
    expectIdle()
    expect(screen.queryByRole('region', { name: 'Selected Witness' })).toBeNull()
  })

  it('Clear Proof preserves current witness and clears all accepted evidence display', () => {
    openSelectedProof()
    generate()
    const id = term('Witness Candidate ID')
    fireEvent.click(screen.getByRole('button', { name: 'Clear Proof' }))
    expectIdle()
    expect(term('Witness Candidate ID', 'Selected Witness')).toBe(id)
    expect(screen.queryByRole('region', { name: 'Reduction Timeline' })).toBeNull()
  })
})

describe('fresh verification and structured failures', () => {
  it('Verify Again verifies the currently saved proof without creating or searching again', () => {
    const create = vi.spyOn(proofApi, 'createImpactProof')
    const verify = vi.spyOn(proofApi, 'verifyImpactProof')
    const search = vi.spyOn(searchApi, 'searchCounterexamples')
    openSelectedProof()
    generate()
    const saved = proofFrom(create)
    fireEvent.click(screen.getByRole('button', { name: 'Verify Again' }))
    expect(verify).toHaveBeenCalledTimes(2)
    expect(verify.mock.lastCall?.[0]).toBe(saved)
    expect(create).toHaveBeenCalledTimes(1)
    expect(search).toHaveBeenCalledTimes(1)
    expect(term('Verification Status')).toBe('Verified')
  })

  it('creation failure shows issue code, path and message without verifier calls or invented costs', () => {
    vi.spyOn(proofApi, 'createImpactProof').mockReturnValueOnce({ success: false, issues: [{
      code: 'overflow', path: ['witness', 'scenario'], message: 'Financial evaluation exceeds the safe integer range.',
    }] })
    const verify = vi.spyOn(proofApi, 'verifyImpactProof')
    openSelectedProof()
    generate()
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('overflow')
    expect(alert.textContent).toContain('witness.scenario')
    expect(alert.textContent).toContain('Financial evaluation exceeds the safe integer range.')
    expect(verify).not.toHaveBeenCalled()
    expect(screen.queryByText('Verified', { exact: true })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Before / After Comparison' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Verify Again' })).toBeNull()
  })

  it('fresh verification failure hides success panels and can recover by verifying the saved proof again', () => {
    const create = vi.spyOn(proofApi, 'createImpactProof')
    const verify = vi.spyOn(proofApi, 'verifyImpactProof').mockReturnValueOnce({ success: false, issues: [{
      code: 'proof_mismatch', path: ['originalComparison'], message: 'Recorded comparison does not match recomputation.',
    }] })
    openSelectedProof()
    generate()
    expect(screen.getByRole('alert').textContent).toContain('Verification failed')
    expect(screen.getByRole('alert').textContent).toContain('proof_mismatch')
    expect(screen.getByRole('alert').textContent).toContain('originalComparison')
    expect(screen.queryByText('Verified', { exact: true })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Before / After Comparison' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Verify Again' }))
    expect(verify.mock.lastCall?.[0]).toBe(proofFrom(create))
    expect(term('Verification Status')).toBe('Verified')
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('a failed Verify Again removes the existing successful verification state', () => {
    const verify = vi.spyOn(proofApi, 'verifyImpactProof')
    openSelectedProof()
    generate()
    verify.mockReturnValueOnce({ success: false, issues: [{
      code: 'proof_mismatch', path: ['minimizedComparison'], message: 'Changed evidence fails verification.',
    }] })
    fireEvent.click(screen.getByRole('button', { name: 'Verify Again' }))
    expect(screen.getByRole('alert').textContent).toContain('Changed evidence fails verification.')
    expect(screen.queryByText('Verified', { exact: true })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Verification Overview' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Before / After Comparison' })).toBeNull()
  })

  it('the unchanged core verifier rejects a generated proof with altered financial totals', () => {
    const create = vi.spyOn(proofApi, 'createImpactProof')
    openSelectedProof()
    generate()
    const forged = structuredClone(proofFrom(create))
    forged.minimizedComparison.newEvaluation.totalCents += 1
    const result = proofApi.verifyImpactProof(forged)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'proof_mismatch', path: ['minimizedComparison'],
    }))
  })
})

describe('accepted reduction timeline and bounded presentation', () => {
  it('displays genuine accepted step reasons, scenarios and comparisons in the actual chain', () => {
    const create = vi.spyOn(proofApi, 'createImpactProof')
    openSelectedProof()
    generate()
    const proof = proofFrom(create)
    const timeline = screen.getByRole('region', { name: 'Reduction Timeline' })
    const details = Array.from(timeline.querySelectorAll('details'))
    expect(details).toHaveLength(Math.min(proof.reductionSteps.length, 10))
    proof.reductionSteps.slice(0, 10).forEach((step, index) => {
      const detail = details[index]!
      expect(detail.querySelector('summary')?.textContent).toBe(`Step ${index + 1}: ${step.type}`)
      expect(detail.textContent).toContain(step.reason)
      const dt = (label: string) => within(detail).getByText(label, { selector: 'dt' }).nextElementSibling?.textContent
      expect(dt('Before Purchase Count')).toBe(String(step.before.transactions.length))
      expect(dt('After Purchase Count')).toBe(String(step.after.transactions.length))
      expect(dt('Before Purchase Total')).toBe(purchaseTotalLabel(step.before))
      expect(dt('After Purchase Total')).toBe(purchaseTotalLabel(step.after))
      expect(dt('Before Payment Delay')).toBe(paymentDelayLabel(step.before))
      expect(dt('After Payment Delay')).toBe(paymentDelayLabel(step.after))
      expect(dt('After Delta')).toBe(formatDeltaCents(step.comparison.deltaCents))
      const accepted = within(detail).getByRole('region', { name: `Step ${index + 1} Accepted Comparison` })
      expect(accepted.textContent).toContain(formatUsdCents(step.comparison.oldEvaluation.totalCents))
      expect(accepted.textContent).toContain(formatUsdCents(step.comparison.newEvaluation.totalCents))
      expect(step.validation.success).toBe(true)
    })
    expect(timeline.textContent).toContain('Rejected attempts are not reduction steps')
  })

  it('incrementally presents a real verified 46-step proof in batches of ten without rerunning core APIs', () => {
    const create = vi.spyOn(proofApi, 'createImpactProof')
    const verify = vi.spyOn(proofApi, 'verifyImpactProof')
    render(<App />)
    navigate('Financial Diff')
    changeRule('Minimum purchases (count)', '31', 'Old Contract')
    fireEvent.click(screen.getByRole('button', { name: 'Apply Changes' }))
    navigate('Counterexample Hunter')
    changeSearch('Purchase Count Min', '30')
    changeSearch('Purchase Count Max', '30')
    changeSearch('Purchase Amount Max (USD)', '1000.00')
    fireEvent.click(screen.getByRole('button', { name: 'Run Search' }))
    navigate('Proof of Impact')
    changeBudget('300')
    generate()
    const proof = proofFrom(create)
    expect(proof.reductionSteps).toHaveLength(46)
    const timeline = screen.getByRole('region', { name: 'Reduction Timeline' })
    expect(timeline.querySelectorAll('details')).toHaveLength(10)
    expect(screen.getByText('Showing 10 of 46 accepted reduction steps.')).toBeTruthy()
    for (const count of [20, 30, 40, 46]) {
      const more = screen.getByRole('button', { name: 'Show More' })
      more.focus()
      expect(document.activeElement).toBe(more)
      fireEvent.click(more)
      expect(timeline.querySelectorAll('details')).toHaveLength(count)
      expect(screen.getByText(`Showing ${count} of 46 accepted reduction steps.`)).toBeTruthy()
    }
    expect(screen.queryByRole('button', { name: 'Show More' })).toBeNull()
    expect(create).toHaveBeenCalledTimes(1)
    expect(verify).toHaveBeenCalledTimes(1)
    expect(term('Verification Status')).toBe('Verified')
    expect(timeline.querySelectorAll('.hunter-event-list')).toHaveLength(0)
  })

  it('describes verified consistency and strategy limits without claiming authenticated or globally minimal evidence', () => {
    openSelectedProof()
    generate()
    const limitations = screen.getByRole('region', { name: 'Limitations' })
    expect(limitations.textContent).toContain('no digital signature')
    expect(limitations.textContent).toContain('tamper-proof guarantee')
    expect(limitations.textContent).toContain('not a proof of a globally minimal counterexample')
    expect(limitations.textContent).toContain('Stage 5C-2')
    expect(screen.queryByRole('button', { name: /download|import|cancel/i })).toBeNull()
    expect(screen.getByRole('region', { name: 'Verification Overview' }).textContent)
      .toContain('rechecks arithmetic, scenarios and reduction constraints')
  })
})

describe('local immutable workspace evidence', () => {
  it('does not mutate frozen formal fixtures, applied snapshots, search reports or saved proof during generation and verification', () => {
    freeze(experiments)
    const beforeFixtures = JSON.stringify(experiments)
    const { result } = renderHook(() => useWorkspace())
    act(() => result.current.selectExperiment(microtransactionPenaltyExperiment.id))
    act(() => result.current.runSearch())
    const snapshot = result.current.searchSnapshot
    if (!snapshot) throw new Error('Expected real snapshot')
    const beforeSnapshot = JSON.stringify(snapshot)
    freeze(snapshot)
    act(() => result.current.generateProof())
    const state = result.current.proofState
    if (state.status !== 'success') throw new Error('Expected real proof success')
    const beforeProof = JSON.stringify(state.proof)
    freeze(state.proof)
    act(() => result.current.verifyProofAgain())
    expect(result.current.proofState.status).toBe('success')
    expect(JSON.stringify(snapshot)).toBe(beforeSnapshot)
    expect(JSON.stringify(state.proof)).toBe(beforeProof)
    expect(JSON.stringify(experiments)).toBe(beforeFixtures)
  })

  it('keeps all proof interaction local without fetch, XMLHttpRequest or persistent browser storage', () => {
    const fetch = vi.fn()
    const xhr = vi.spyOn(XMLHttpRequest.prototype, 'open')
    const storageRead = vi.spyOn(Storage.prototype, 'getItem')
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem')
    const storageRemove = vi.spyOn(Storage.prototype, 'removeItem')
    const databaseOpen = vi.fn()
    vi.stubGlobal('fetch', fetch)
    vi.stubGlobal('indexedDB', { open: databaseOpen })
    openSelectedProof()
    generate()
    fireEvent.click(screen.getByRole('button', { name: 'Verify Again' }))
    navigate('Dashboard')
    navigate('Proof of Impact')
    fireEvent.click(screen.getByRole('button', { name: 'Clear Proof' }))
    for (const spy of [fetch, xhr, storageRead, storageWrite, storageRemove, databaseOpen]) expect(spy).not.toHaveBeenCalled()
  })

  it('provides associated labels, native focusable controls and an announced real verification result', () => {
    openSelectedProof()
    const control = screen.getByRole('textbox', { name: 'Max Checks' })
    expect(control.getAttribute('inputmode')).toBe('numeric')
    expect(control.getAttribute('aria-describedby')).toContain('proof-maxChecks-hint')
    const button = screen.getByRole('button', { name: 'Generate Proof' })
    button.focus()
    expect(document.activeElement).toBe(button)
    generate()
    expect(screen.getByRole('status').textContent).toMatch(/Proof verification passed.*financial comparisons verified/)
    const again = screen.getByRole('button', { name: 'Verify Again' })
    again.focus()
    expect(document.activeElement).toBe(again)
    expect(again.tagName).toBe('BUTTON')
    expect(screen.getByRole('main').classList.contains('proof-main')).toBe(true)
    expect(screen.getByRole('region', { name: 'Before / After Comparison' }).querySelector('.proof-comparison-grid')).toBeTruthy()
  })

  it('a fresh App mount restores the original memory-only empty state', () => {
    const mounted = render(<App />)
    navigate('Counterexample Hunter')
    fireEvent.click(screen.getByRole('button', { name: 'Run Search' }))
    navigate('Proof of Impact')
    generate()
    expect(term('Verification Status')).toBe('Verified')
    mounted.unmount()
    render(<App />)
    navigate('Proof of Impact')
    expectIdle()
    expect(screen.getByText('No witness selected. Run a counterexample search and select a witness first.')).toBeTruthy()
  })
})
