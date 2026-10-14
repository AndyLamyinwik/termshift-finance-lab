// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MockInstance } from 'vitest'
import App from '../../App'
import * as proofApi from '../../proof'
import type { ImpactProof } from '../../proof'
import { experiments, gracePeriodShiftExperiment, microtransactionPenaltyExperiment, waiverTrapExperiment } from '../../scenarios'
import type { ExperimentFixture } from '../../scenarios'
import { searchCounterexamples } from '../../search'
import { formatDeltaCents, formatUsdCents } from '../dashboard/format'
import { createSearchBase, DEFAULT_SEARCH_OPTIONS } from '../hunter/options'
import { useWorkspace } from '../workspace/useWorkspace'
import * as portable from './portable'

type ViewName = 'Dashboard' | 'Financial Diff' | 'Counterexample Hunter' | 'Proof of Impact'
const originalUrl = URL
let capturedBlobs: Blob[] = []
let capturedDownloads: { name: string; href: string }[] = []
let createUrl = vi.fn<(blob: Blob) => string>()
let revokeUrl = vi.fn<(url: string) => void>()

beforeEach(() => {
  capturedBlobs = []
  capturedDownloads = []
  createUrl = vi.fn((blob: Blob) => {
    capturedBlobs.push(blob)
    return `blob:termshift-test-${capturedBlobs.length}`
  })
  revokeUrl = vi.fn()
  class TestUrl extends originalUrl {
    static createObjectURL = createUrl
    static revokeObjectURL = revokeUrl
  }
  vi.stubGlobal('URL', TestUrl)
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    capturedDownloads.push({ name: this.download, href: this.href })
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function navigate(name: ViewName) {
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Main navigation' })).getByRole('button', { name }))
}

function showProof() {
  render(<App />)
  navigate('Proof of Impact')
}

function openGenerated(experiment: ExperimentFixture = microtransactionPenaltyExperiment) {
  render(<App />)
  navigate('Counterexample Hunter')
  fireEvent.change(screen.getByRole('combobox', { name: 'Experiment' }), { target: { value: experiment.id } })
  fireEvent.click(screen.getByRole('button', { name: 'Run Search' }))
  navigate('Proof of Impact')
  fireEvent.click(screen.getByRole('button', { name: 'Generate Proof' }))
}

function view(name: 'Current Workspace Proof' | 'Imported Proof') {
  fireEvent.click(screen.getByRole('button', { name }))
}

function proofFrom(spy: MockInstance<typeof proofApi.createImpactProof>): ImpactProof {
  const result = spy.mock.results.at(-1)?.value as ReturnType<typeof proofApi.createImpactProof> | undefined
  if (!result?.success) throw new Error('Expected a real generated proof')
  return result.data
}

const proofCache = new Map<string, ImpactProof>()
function proofFor(experiment: ExperimentFixture): ImpactProof {
  const cached = proofCache.get(experiment.id)
  if (cached) return structuredClone(cached)
  const base = createSearchBase(experiment.scenario)
  if (!base.success) throw new Error(JSON.stringify(base.issues))
  const search = searchCounterexamples(experiment.oldContract, experiment.newContract, base.data, DEFAULT_SEARCH_OPTIONS)
  if (!search.success || !search.data.witnesses[0]) throw new Error('Expected a real witness')
  const created = proofApi.createImpactProof(experiment.oldContract, experiment.newContract,
    search.data.witnesses[0], DEFAULT_SEARCH_OPTIONS, { maxChecks: 200 })
  if (!created.success) throw new Error(JSON.stringify(created.issues))
  proofCache.set(experiment.id, created.data)
  return structuredClone(created.data)
}

function externalProof(): ImpactProof {
  const experiment = structuredClone(microtransactionPenaltyExperiment)
  experiment.id = 'independent-history'
  experiment.oldContract.id = 'independent-contract-old'
  experiment.newContract.id = 'independent-contract-new'
  experiment.oldContract.name = 'Independent historical contract'
  experiment.newContract.name = 'Independent replacement contract'
  experiment.scenario.id = 'independent-scenario'
  return proofFor(experiment)
}

function proofFile(proof: unknown, name = 'termshift-impact-proof.json', type = 'application/json'): File {
  return new File([JSON.stringify(proof, null, 2)], name, { type })
}

function chooseFile(file?: File) {
  fireEvent.change(screen.getByLabelText('Import Proof JSON'), { target: { files: file ? [file] : [] } })
}

async function importProof(proof: unknown) {
  chooseFile(proofFile(proof))
  await screen.findByText('Imported proof verified independently against its embedded contracts.')
}

function term(label: string, region = 'Verification Overview', role: 'region' | 'article' = 'region') {
  const dt = within(screen.getByRole(role, { name: region })).getByText(label, { selector: 'dt' })
  return dt.nextElementSibling?.textContent?.trim() ?? ''
}

async function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Unable to read captured download'))
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result) : reject(new Error('Expected downloaded text'))
    reader.readAsText(blob, 'UTF-8')
  })
}

async function downloadedText(): Promise<string> {
  expect(capturedBlobs).toHaveLength(1)
  return readBlob(capturedBlobs[0]!)
}

function expectNoImportedFinancialData() {
  expect(screen.queryByText('Verified imported proof', { exact: true })).toBeNull()
  expect(screen.queryByRole('region', { name: 'Verification Overview' })).toBeNull()
  expect(screen.queryByRole('region', { name: 'Before / After Comparison' })).toBeNull()
}

describe('verified portable downloads', () => {
  it('keeps both downloads disabled before a verified workspace proof exists', () => {
    showProof()
    for (const name of ['Download JSON', 'Download Markdown']) {
      const button = screen.getByRole('button', { name }) as HTMLButtonElement
      expect(button.disabled).toBe(true)
      fireEvent.click(button)
    }
    expect(createUrl).not.toHaveBeenCalled()
    expect(capturedDownloads).toEqual([])
  })

  it.each(experiments)('downloads the complete formal proof and verifies the JSON round trip for $name', async (experiment) => {
    const create = vi.spyOn(proofApi, 'createImpactProof')
    openGenerated(experiment)
    const proof = proofFrom(create)
    fireEvent.click(screen.getByRole('button', { name: 'Download JSON' }))
    const text = await downloadedText()
    const parsed: unknown = JSON.parse(text)
    expect(parsed).toEqual(proof)
    expect(text).toBe(JSON.stringify(parsed, null, 2))
    expect(proofApi.ImpactProofSchema.safeParse(parsed).success).toBe(true)
    const verification = proofApi.verifyImpactProof(parsed)
    expect(verification.success).toBe(true)
    if (verification.success) expect(verification.data.proof).toEqual(proof)
    expect(capturedDownloads).toEqual([{ name: 'termshift-impact-proof.json', href: 'blob:termshift-test-1' }])
    expect(capturedBlobs[0]?.type).toMatch(/^application\/json/)
    expect(Object.keys(parsed as object).sort()).toEqual(Object.keys(proof).sort())
    expect(document.querySelector('a[download]')).toBeNull()
    await waitFor(() => expect(revokeUrl).toHaveBeenCalledWith('blob:termshift-test-1'))
  })

  it.each(experiments)('downloads the existing deterministic Markdown formatter output for $name', async (experiment) => {
    const create = vi.spyOn(proofApi, 'createImpactProof')
    const format = vi.spyOn(proofApi, 'formatImpactReport')
    openGenerated(experiment)
    const proof = proofFrom(create)
    const expected = proofApi.formatImpactReport(proof)
    if (!expected.success) throw new Error(JSON.stringify(expected.issues))
    format.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Download Markdown' }))
    expect(format).toHaveBeenCalledTimes(1)
    expect(format.mock.lastCall?.[0]).toEqual(proof)
    expect(await downloadedText()).toBe(expected.data)
    expect(expected.data).toContain(formatDeltaCents(proof.minimizedComparison.deltaCents))
    for (const section of ['Original Scenario', 'Minimized Scenario', 'Reduction Summary', 'Reproduction Information', 'Limitations']) {
      expect(expected.data).toContain(section)
    }
    expect(capturedDownloads[0]?.name).toBe('termshift-impact-report.md')
    expect(capturedBlobs[0]?.type).toMatch(/^text\/markdown/)
    await waitFor(() => expect(revokeUrl).toHaveBeenCalledTimes(1))
  })

  it('shows formal formatter issues and creates no Blob or download for a failed Markdown report', () => {
    openGenerated()
    const format = vi.spyOn(proofApi, 'formatImpactReport').mockReturnValueOnce({ success: false, issues: [{
      code: 'proof_mismatch', path: ['minimizedComparison'], message: 'Formal formatter rejected altered comparison.',
    }] })
    fireEvent.click(screen.getByRole('button', { name: 'Download Markdown' }))
    expect(format).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alert').textContent).toContain('Formal formatter rejected altered comparison.')
    expect(screen.getByRole('alert').textContent).toContain('proof_mismatch')
    expect(screen.getByRole('alert').textContent).toContain('minimizedComparison')
    expect(createUrl).not.toHaveBeenCalled()
    expect(capturedDownloads).toEqual([])
  })

  it('refuses a fresh verification failure instead of exporting stale Verified workspace evidence', () => {
    openGenerated()
    vi.spyOn(proofApi, 'verifyImpactProof').mockReturnValueOnce({ success: false, issues: [{
      code: 'proof_mismatch', path: ['originalComparison'], message: 'Fresh export verification failed.',
    }] })
    fireEvent.click(screen.getByRole('button', { name: 'Download JSON' }))
    expect(screen.getByRole('alert').textContent).toContain('Fresh export verification failed.')
    expect(createUrl).not.toHaveBeenCalled()
  })

  it('clears a successful workspace proof when inputs invalidate it and disables its exports', () => {
    openGenerated()
    fireEvent.change(screen.getByRole('textbox', { name: 'Max Checks' }), { target: { value: '100' } })
    for (const name of ['Download JSON', 'Download Markdown']) {
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true)
    }
    expect(createUrl).not.toHaveBeenCalled()
  })

  it('delays each Object URL revocation until after its native anchor click and cleans up both downloads', () => {
    openGenerated()
    vi.useFakeTimers()
    for (const name of ['Download JSON', 'Download Markdown']) fireEvent.click(screen.getByRole('button', { name }))
    expect(capturedDownloads).toHaveLength(2)
    expect(createUrl).toHaveBeenCalledTimes(2)
    expect(revokeUrl).not.toHaveBeenCalled()
    expect(document.querySelector('a[download]')).toBeNull()
    vi.runAllTimers()
    expect(revokeUrl.mock.calls).toEqual([['blob:termshift-test-1'], ['blob:termshift-test-2']])
  })

  it('removes the anchor and releases its URL even if the native download click fails', () => {
    openGenerated()
    vi.useFakeTimers()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementationOnce(() => { throw new Error('Unavailable browser download') })
    fireEvent.click(screen.getByRole('button', { name: 'Download JSON' }))
    expect(screen.getByRole('alert').textContent).toContain('export_failed')
    expect(screen.getByRole('alert').textContent).toContain('local evidence download')
    expect(document.querySelector('a[download]')).toBeNull()
    expect(revokeUrl).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(revokeUrl).toHaveBeenCalledWith('blob:termshift-test-1')
  })
})

describe('native local JSON import and formal verification', () => {
  it('provides a native local file selector and an explicitly empty Imported Proof view', () => {
    showProof()
    const input = screen.getByLabelText('Import Proof JSON') as HTMLInputElement
    expect(input.type).toBe('file')
    expect(input.accept).toBe('.json,application/json')
    expect(input.multiple).toBe(false)
    view('Imported Proof')
    expect(screen.getByRole('region', { name: 'Imported Evidence' })).toBeTruthy()
    expect(screen.getByText('Verification Status: No imported proof')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Verify Imported Proof Again' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Clear Imported Proof' }) as HTMLButtonElement).disabled).toBe(true)
    expectNoImportedFinancialData()
  })

  it.each(experiments)('imports and independently verifies a real File for $name', async (experiment) => {
    const proof = proofFor(experiment)
    const verify = vi.spyOn(proofApi, 'verifyImpactProof')
    showProof()
    await importProof(proof)
    expect(verify).toHaveBeenCalled()
    expect(term('Verification Status')).toBe('Verified imported proof')
    expect(term('Old Contract ID')).toBe(proof.oldContract.id)
    expect(term('New Contract ID')).toBe(proof.newContract.id)
    expect(term('Witness Candidate ID')).toBe(proof.witnessSource.candidateId)
    expect(term('Proof Schema Version')).toBe('1')
    expect(term('Original Cost Difference')).toBe(formatDeltaCents(proof.originalComparison.deltaCents))
    expect(term('Minimized Cost Difference')).toBe(formatDeltaCents(proof.minimizedComparison.deltaCents))
    expect(term('New Contract Total', 'Minimized Witness', 'article'))
      .toBe(formatUsdCents(proof.minimizedComparison.newEvaluation.totalCents))
    expect((screen.getByRole('button', { name: 'Imported Proof' })).getAttribute('aria-pressed')).toBe('true')
    expect((screen.getByRole('button', { name: 'Download JSON' }) as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByLabelText('Import Proof JSON') as HTMLInputElement).value).toBe('')
  })

  it('uses embedded identities for a legal independent proof unrelated to the selected built-in experiment', async () => {
    const proof = externalProof()
    showProof()
    await importProof(proof)
    expect(term('Old Contract ID')).toBe('independent-contract-old')
    expect(term('New Contract ID')).toBe('independent-contract-new')
    const overview = screen.getByRole('region', { name: 'Verification Overview' })
    expect(within(overview).queryByText('Experiment', { selector: 'dt' })).toBeNull()
    for (const experiment of experiments) expect(overview.textContent).not.toContain(experiment.name)
    view('Current Workspace Proof')
    expect((screen.getByRole('combobox', { name: 'Experiment' }) as HTMLSelectElement).value).toBe(waiverTrapExperiment.id)
  })

  it('exports the selected imported proof rather than an unrelated valid current workspace proof', async () => {
    const create = vi.spyOn(proofApi, 'createImpactProof')
    openGenerated(waiverTrapExperiment)
    const current = proofFrom(create)
    const imported = proofFor(gracePeriodShiftExperiment)
    await importProof(imported)
    fireEvent.click(screen.getByRole('button', { name: 'Download JSON' }))
    expect(JSON.parse(await downloadedText())).toEqual(imported)
    view('Current Workspace Proof')
    expect(term('Old Contract ID')).toBe(current.oldContract.id)
    expect(term('Verification Status')).toBe('Verified')
  })

  it('downloads JSON then reimports the captured Blob through the native File selector', async () => {
    const create = vi.spyOn(proofApi, 'createImpactProof')
    openGenerated()
    const original = proofFrom(create)
    fireEvent.click(screen.getByRole('button', { name: 'Download JSON' }))
    const saved = new File([capturedBlobs[0]!], capturedDownloads[0]!.name, { type: 'application/json' })
    chooseFile(saved)
    await screen.findByText('Imported proof verified independently against its embedded contracts.')
    expect(term('Minimized Cost Difference')).toBe(formatDeltaCents(original.minimizedComparison.deltaCents))
    expect(term('Old Contract ID')).toBe(original.oldContract.id)
  })

  it('reverifies the saved imported proof through the formal API without new file reading, search or generation', async () => {
    const proof = proofFor(microtransactionPenaltyExperiment)
    const verify = vi.spyOn(proofApi, 'verifyImpactProof')
    const create = vi.spyOn(proofApi, 'createImpactProof')
    const read = vi.spyOn(portable, 'readAndVerifyProofFile')
    showProof()
    await importProof(proof)
    verify.mockClear()
    read.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Verify Imported Proof Again' }))
    expect(verify).toHaveBeenCalledTimes(1)
    expect(verify.mock.lastCall?.[0]).toEqual(proof)
    expect(read).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
    expect(term('Verification Status')).toBe('Verified imported proof')
  })

  it('removes imported Verified and financial panels after a Verify Again failure', async () => {
    showProof()
    await importProof(proofFor(microtransactionPenaltyExperiment))
    vi.spyOn(proofApi, 'verifyImpactProof').mockReturnValueOnce({ success: false, issues: [{
      code: 'proof_mismatch', path: ['minimizedComparison'], message: 'Imported evidence failed the fresh calculation.',
    }] })
    fireEvent.click(screen.getByRole('button', { name: 'Verify Imported Proof Again' }))
    expect(screen.getByRole('alert').textContent).toContain('Imported evidence failed the fresh calculation.')
    expect(screen.getByRole('alert').textContent).toContain('Verification failed')
    expectNoImportedFinancialData()
    expect((screen.getByRole('button', { name: 'Download JSON' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Verify Imported Proof Again' }))
    expect(term('Verification Status')).toBe('Verified imported proof')
  })
})

describe('untrusted and damaged file rejection', () => {
  it.each(['{broken json', '', 'null', '[]', 'true', '42', '"verified"'])('rejects invalid JSON or a non-proof root %j', async (text) => {
    showProof()
    chooseFile(new File([text], 'allegedly-verified.json', { type: 'application/json' }))
    const error = await screen.findByRole('alert')
    expect(error.textContent).toContain('Import failed')
    expectNoImportedFinancialData()
    expect(createUrl).not.toHaveBeenCalled()
  })

  it.each([
    ['unsupported schema version', (proof: ImpactProof) => ({ ...proof, proofSchemaVersion: 2 })],
    ['missing embedded contract', (proof: ImpactProof) => { const incomplete: Partial<ImpactProof> = { ...proof }; delete incomplete.oldContract; return incomplete }],
    ['forged Verified flag', (proof: ImpactProof) => ({ ...proof, status: 'Verified', verified: true })],
    ['unsupported calculation policy', (proof: ImpactProof) => ({ ...proof, calculationPolicy: { ...proof.calculationPolicy, currency: 'EUR' } })],
  ] as const)('rejects %s through the strict existing schema', async (_description, damage) => {
    showProof()
    chooseFile(proofFile(damage(proofFor(microtransactionPenaltyExperiment))))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Import failed')
    expect(alert.textContent).toContain('validation_error')
    expectNoImportedFinancialData()
  })

  it.each([
    ['recorded financial total', (proof: ImpactProof) => { proof.minimizedComparison.newEvaluation.totalCents += 1 }],
    ['recorded signed delta', (proof: ImpactProof) => { proof.minimizedComparison.deltaCents += 1 }],
    ['accepted step comparison', (proof: ImpactProof) => { proof.reductionSteps[0]!.comparison.deltaCents += 1 }],
    ['accepted step objective', (proof: ImpactProof) => { proof.reductionSteps[0]!.validation.objective.purchaseTotalCents += 1 }],
    ['step chain removal', (proof: ImpactProof) => { proof.reductionSteps.shift() }],
  ] as const)('rejects tampered %s by recomputing formal financial evidence', async (_description, damage) => {
    const proof = proofFor(microtransactionPenaltyExperiment)
    damage(proof)
    expect(proofApi.ImpactProofSchema.safeParse(proof).success).toBe(true)
    showProof()
    chooseFile(proofFile(proof))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Verification failed')
    expect(alert.textContent).toContain('proof_mismatch')
    expectNoImportedFinancialData()
    expect((screen.getByRole('button', { name: 'Download Markdown' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('rejects a changed payment obligation even when the submitted financial totals remain unchanged', async () => {
    const proof = proofFor(gracePeriodShiftExperiment)
    proof.minimizedScenario.paymentEvents[0]!.amountCents += 1
    expect(proofApi.ImpactProofSchema.safeParse(proof).success).toBe(true)
    showProof()
    chooseFile(proofFile(proof))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Verification failed')
    expect(alert.textContent).toContain('invariant_violation')
    expectNoImportedFinancialData()
  })

  it('rejects a file larger than 5 MiB before calling FileReader or the proof verifier', async () => {
    const read = vi.spyOn(FileReader.prototype, 'readAsArrayBuffer')
    const verify = vi.spyOn(proofApi, 'verifyImpactProof')
    showProof()
    chooseFile(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'too-large.json', { type: 'application/json' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/5 MiB|5242880/)
    expect(read).not.toHaveBeenCalled()
    expect(verify).not.toHaveBeenCalled()
    expectNoImportedFinancialData()
  })

  it('does not trust a perfect JSON filename and MIME when the contents are malformed', async () => {
    showProof()
    chooseFile(new File(['<script>globalThis.portableInjected = true</script>'], 'termshift-impact-proof.json', { type: 'application/json' }))
    await screen.findByRole('alert')
    expectNoImportedFinancialData()
    expect(document.querySelector('script')).toBeNull()
  })

  it('verifies legal JSON by its contents even with an unusual untrusted filename and MIME', async () => {
    const proof = externalProof()
    showProof()
    chooseFile(proofFile(proof, '../../../untrusted-very-long-name-'.repeat(20) + '.html', 'text/html'))
    await screen.findByText('Imported proof verified independently against its embedded contracts.')
    expect(term('Old Contract ID')).toBe(proof.oldContract.id)
    expect(document.querySelector('img, script, iframe')).toBeNull()
  })

  it('renders legal hostile-looking reason text as inert React text without adding tags or URLs', async () => {
    const proof = proofFor(microtransactionPenaltyExperiment)
    const payload = '<img src="https://attacker.invalid/pixel" onerror="alert(1)"><script>globalThis.injected = true</script>'
    proof.reductionSteps[0]!.reason = payload
    expect(proofApi.verifyImpactProof(proof).success).toBe(true)
    const xhr = vi.spyOn(XMLHttpRequest.prototype, 'open')
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    showProof()
    await importProof(proof)
    expect(screen.getByText(payload)).toBeTruthy()
    expect(document.querySelector('img, script, iframe')).toBeNull()
    expect(document.querySelector('[onerror], [onclick]')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
    expect(xhr).not.toHaveBeenCalled()
  })

  it('replaces old imported Verified status immediately and hides old financial values after the next invalid file', async () => {
    showProof()
    await importProof(proofFor(waiverTrapExperiment))
    chooseFile(new File(['{invalid'], 'damaged.json', { type: 'application/json' }))
    expect(screen.queryByText('Verified imported proof', { exact: true })).toBeNull()
    await screen.findByRole('alert')
    expectNoImportedFinancialData()
    expect((screen.getByRole('button', { name: 'Download JSON' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('rejects invalid UTF-8 bytes in a real selected File instead of silently replacing them', async () => {
    showProof()
    chooseFile(new File([new Uint8Array([0xc3, 0x28])], 'invalid-encoding.json', { type: 'application/json' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('invalid_utf8')
    expect(alert.textContent).toContain('valid UTF-8')
    expectNoImportedFinancialData()
  })

  it('handles FileReader failure as an accessible import error without verifying incomplete data', async () => {
    const proof = proofFor(microtransactionPenaltyExperiment)
    const verify = vi.spyOn(proofApi, 'verifyImpactProof')
    vi.spyOn(FileReader.prototype, 'readAsArrayBuffer').mockImplementation(function (this: FileReader) {
      this.dispatchEvent(new ProgressEvent('error'))
    })
    showProof()
    chooseFile(proofFile(proof))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('file_read_error')
    expect(verify).not.toHaveBeenCalled()
    expectNoImportedFinancialData()
  })

  it('an empty file selection clears imported success and reports the missing file without affecting current evidence', async () => {
    openGenerated()
    await importProof(proofFor(gracePeriodShiftExperiment))
    chooseFile()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('missing_file')
    expectNoImportedFinancialData()
    view('Current Workspace Proof')
    expect(term('Verification Status')).toBe('Verified')
  })
})

describe('evidence isolation and memory-only lifetime', () => {
  it('preserves the current verified proof, applied contracts and SearchSnapshot across import, failure and clearing', async () => {
    const { result } = renderHook(() => useWorkspace())
    act(() => result.current.selectExperiment(microtransactionPenaltyExperiment.id))
    act(() => result.current.runSearch())
    act(() => result.current.generateProof())
    const old = result.current.workingOldContract
    const next = result.current.workingNewContract
    const snapshot = result.current.searchSnapshot
    const proofState = result.current.proofState
    const fixtures = JSON.stringify(experiments)
    await act(() => result.current.importProofFile(proofFile(proofFor(gracePeriodShiftExperiment))))
    expect(result.current.workingOldContract).toBe(old)
    expect(result.current.workingNewContract).toBe(next)
    expect(result.current.searchSnapshot).toBe(snapshot)
    expect(result.current.proofState).toBe(proofState)
    await act(() => result.current.importProofFile(new File(['not json'], 'bad.json')))
    expect(result.current.proofState).toBe(proofState)
    expect(result.current.searchSnapshot).toBe(snapshot)
    act(() => result.current.clearImportedProof())
    expect(result.current.proofState).toBe(proofState)
    expect(result.current.searchSnapshot).toBe(snapshot)
    expect(JSON.stringify(experiments)).toBe(fixtures)
  })

  it('Clear Imported Proof removes only imported evidence and leaves a current verified proof usable', async () => {
    const create = vi.spyOn(proofApi, 'createImpactProof')
    openGenerated(waiverTrapExperiment)
    const current = proofFrom(create)
    await importProof(proofFor(gracePeriodShiftExperiment))
    fireEvent.click(screen.getByRole('button', { name: 'Clear Imported Proof' }))
    expectNoImportedFinancialData()
    expect(screen.getByText('Verification Status: No imported proof')).toBeTruthy()
    view('Current Workspace Proof')
    expect(term('Verification Status')).toBe('Verified')
    expect(term('Minimized Cost Difference')).toBe(formatDeltaCents(current.minimizedComparison.deltaCents))
    expect((screen.getByRole('button', { name: 'Download JSON' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('Financial Diff Apply, Reset and experiment changes do not alter saved imported contracts or fees', async () => {
    const imported = proofFor(gracePeriodShiftExperiment)
    showProof()
    await importProof(imported)
    navigate('Financial Diff')
    fireEvent.change(within(screen.getByRole('group', { name: 'New Contract' })).getByLabelText('Monthly fee (USD)'),
      { target: { value: '7.00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply Changes' }))
    navigate('Proof of Impact')
    view('Imported Proof')
    expect(term('New Contract ID')).toBe(imported.newContract.id)
    expect(term('Minimized Cost Difference')).toBe('+$15.00')
    navigate('Financial Diff')
    fireEvent.click(screen.getByRole('button', { name: 'Reset to Original' }))
    navigate('Proof of Impact')
    view('Imported Proof')
    expect(term('Minimized Cost Difference')).toBe('+$15.00')
    navigate('Financial Diff')
    fireEvent.change(screen.getByRole('combobox', { name: 'Experiment' }), { target: { value: microtransactionPenaltyExperiment.id } })
    navigate('Proof of Impact')
    view('Imported Proof')
    expect(term('Old Contract ID')).toBe(imported.oldContract.id)
    expect(term('Minimized Cost Difference')).toBe('+$15.00')
  })

  it('failed imports leave the prior workspace Verified result available after switching back', async () => {
    openGenerated()
    chooseFile(new File(['{}'], 'invalid.json'))
    await screen.findByRole('alert')
    expectNoImportedFinancialData()
    view('Current Workspace Proof')
    expect(term('Verification Status')).toBe('Verified')
    expect(term('Minimized Cost Difference')).toBe('+$0.20')
  })

  it('preserves the imported view and proof through navigation without generating or rereading it', async () => {
    const proof = proofFor(gracePeriodShiftExperiment)
    const read = vi.spyOn(portable, 'readAndVerifyProofFile')
    const create = vi.spyOn(proofApi, 'createImpactProof')
    showProof()
    await importProof(proof)
    for (const target of ['Dashboard', 'Financial Diff', 'Counterexample Hunter', 'Proof of Impact'] as const) navigate(target)
    expect(term('Verification Status')).toBe('Verified imported proof')
    expect(term('Old Contract ID')).toBe(proof.oldContract.id)
    expect(read).toHaveBeenCalledTimes(1)
    expect(create).not.toHaveBeenCalled()
  })

  it('starts a fresh App mount without imported or current evidence', async () => {
    const mounted = render(<App />)
    navigate('Proof of Impact')
    await importProof(proofFor(gracePeriodShiftExperiment))
    mounted.unmount()
    render(<App />)
    navigate('Proof of Impact')
    expect(screen.getByText('Verification Status: Not generated')).toBeTruthy()
    view('Imported Proof')
    expect(screen.getByText('Verification Status: No imported proof')).toBeTruthy()
    expectNoImportedFinancialData()
  })

  it('uses no fetch, XMLHttpRequest or persistent browser storage throughout export/import/verify/clear', async () => {
    const fetch = vi.fn()
    const xhr = vi.spyOn(XMLHttpRequest.prototype, 'open')
    const storage = ['getItem', 'setItem', 'removeItem'].map((method) => vi.spyOn(Storage.prototype, method as 'getItem'))
    const databaseOpen = vi.fn()
    vi.stubGlobal('fetch', fetch)
    vi.stubGlobal('indexedDB', { open: databaseOpen })
    openGenerated()
    fireEvent.click(screen.getByRole('button', { name: 'Download JSON' }))
    const file = new File([capturedBlobs[0]!], 'local.json')
    chooseFile(file)
    await screen.findByText('Imported proof verified independently against its embedded contracts.')
    fireEvent.click(screen.getByRole('button', { name: 'Verify Imported Proof Again' }))
    fireEvent.click(screen.getByRole('button', { name: 'Download Markdown' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear Imported Proof' }))
    for (const spy of [fetch, xhr, ...storage, databaseOpen]) expect(spy).not.toHaveBeenCalled()
  })

  it('uses labeled native keyboard-focusable controls and announces a verified independent import', async () => {
    showProof()
    const file = screen.getByLabelText('Import Proof JSON') as HTMLInputElement
    file.focus()
    expect(document.activeElement).toBe(file)
    const toggle = screen.getByRole('button', { name: 'Imported Proof' })
    toggle.focus()
    expect(document.activeElement).toBe(toggle)
    expect(toggle.tagName).toBe('BUTTON')
    await importProof(proofFor(microtransactionPenaltyExperiment))
    expect(screen.getByRole('status').textContent).toContain('Imported proof verified independently against its embedded contracts.')
    for (const name of ['Download JSON', 'Download Markdown', 'Verify Imported Proof Again', 'Clear Imported Proof']) {
      const button = screen.getByRole('button', { name })
      expect(button.tagName).toBe('BUTTON')
      button.focus()
      expect(document.activeElement).toBe(button)
      expect((button as HTMLButtonElement).disabled).toBe(false)
    }
    expect(screen.getByRole('region', { name: 'Imported Evidence' }).textContent).toContain('embedded contracts')
  })
})

describe('asynchronous local file selection races', () => {
  function verified(proof: ImpactProof) {
    const result = proofApi.verifyImpactProof(proof)
    if (!result.success) throw new Error(JSON.stringify(result.issues))
    return { success: true as const, data: result.data }
  }

  function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (reason: unknown) => void
    const promise = new Promise<T>((success, failure) => { resolve = success; reject = failure })
    return { promise, resolve, reject }
  }

  it('never lets a slow earlier file overwrite a newer successful selection', async () => {
    const oldProof = proofFor(waiverTrapExperiment)
    const newProof = proofFor(gracePeriodShiftExperiment)
    const first = deferred<Awaited<ReturnType<typeof portable.readAndVerifyProofFile>>>()
    const second = deferred<Awaited<ReturnType<typeof portable.readAndVerifyProofFile>>>()
    vi.spyOn(portable, 'readAndVerifyProofFile').mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    showProof()
    chooseFile(proofFile(oldProof, 'slow-old.json'))
    chooseFile(proofFile(newProof, 'fast-new.json'))
    await act(async () => { second.resolve(verified(newProof)); await second.promise })
    expect(term('Old Contract ID')).toBe(newProof.oldContract.id)
    await act(async () => { first.resolve(verified(oldProof)); await first.promise })
    expect(term('Old Contract ID')).toBe(newProof.oldContract.id)
    expect(term('Minimized Cost Difference')).toBe('+$15.00')
  })

  it('does not restore stale Verified if a newer selection fails before the old read succeeds', async () => {
    const proof = proofFor(waiverTrapExperiment)
    const first = deferred<Awaited<ReturnType<typeof portable.readAndVerifyProofFile>>>()
    vi.spyOn(portable, 'readAndVerifyProofFile').mockReturnValueOnce(first.promise)
    showProof()
    chooseFile(proofFile(proof, 'slow.json'))
    chooseFile(new File(['broken'], 'new-bad.json'))
    await screen.findByRole('alert')
    await act(async () => { first.resolve(verified(proof)); await first.promise })
    expectNoImportedFinancialData()
    expect(screen.getByRole('alert').textContent).toContain('Import failed')
  })

  it('Clear Imported Proof cancels the pending read outcome without deleting workspace evidence', async () => {
    const proof = proofFor(gracePeriodShiftExperiment)
    const read = deferred<Awaited<ReturnType<typeof portable.readAndVerifyProofFile>>>()
    vi.spyOn(portable, 'readAndVerifyProofFile').mockReturnValueOnce(read.promise)
    openGenerated()
    chooseFile(proofFile(proof))
    expect(screen.getByRole('status').textContent).toContain('Reading local file')
    fireEvent.click(screen.getByRole('button', { name: 'Clear Imported Proof' }))
    await act(async () => { read.resolve(verified(proof)); await read.promise })
    expect(screen.getByText('Verification Status: No imported proof')).toBeTruthy()
    expectNoImportedFinancialData()
    view('Current Workspace Proof')
    expect(term('Verification Status')).toBe('Verified')
  })

  it('ignores a late rejected read after a newer genuine File has successfully verified', async () => {
    const proof = proofFor(gracePeriodShiftExperiment)
    const first = deferred<Awaited<ReturnType<typeof portable.readAndVerifyProofFile>>>()
    vi.spyOn(portable, 'readAndVerifyProofFile').mockReturnValueOnce(first.promise)
    showProof()
    chooseFile(proofFile(proofFor(waiverTrapExperiment), 'slow-error.json'))
    await importProof(proof)
    await act(async () => { first.reject(new Error('Late filesystem error')); await first.promise.catch(() => undefined) })
    expect(term('Verification Status')).toBe('Verified imported proof')
    expect(term('Old Contract ID')).toBe(proof.oldContract.id)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('does not publish a pending file outcome into a fresh App after the previous App unmounts', async () => {
    const proof = proofFor(gracePeriodShiftExperiment)
    const first = deferred<Awaited<ReturnType<typeof portable.readAndVerifyProofFile>>>()
    vi.spyOn(portable, 'readAndVerifyProofFile').mockReturnValueOnce(first.promise)
    const mounted = render(<App />)
    navigate('Proof of Impact')
    chooseFile(proofFile(proof))
    mounted.unmount()
    showProof()
    view('Imported Proof')
    await act(async () => { first.resolve(verified(proof)); await first.promise })
    expect(screen.getByText('Verification Status: No imported proof')).toBeTruthy()
    expectNoImportedFinancialData()
  })
})
