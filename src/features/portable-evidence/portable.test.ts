// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as proofApi from '../../proof'
import type { ImpactProof } from '../../proof'
import { experiments } from '../../scenarios'
import { searchCounterexamples } from '../../search'
import { createSearchBase, DEFAULT_SEARCH_OPTIONS } from '../hunter/options'
import {
  MAX_IMPORT_BYTES,
  downloadTextFile,
  parseAndVerifyProofBytes,
  prepareMarkdownExport,
  prepareProofJsonExport,
  readAndVerifyProofFile,
} from './portable'
import type { ImportResult, PortableResult, TextDownload } from './portable'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

function success<T>(result: PortableResult<T>): T {
  expect(result.success).toBe(true)
  if (!result.success) throw new Error(JSON.stringify(result.issues))
  return result.data
}

function imported(result: ImportResult) {
  return success(result)
}

function failure(result: ImportResult, phase: 'import' | 'verification', code?: string) {
  expect(result.success).toBe(false)
  expect(result).not.toHaveProperty('data')
  if (result.success) throw new Error('Expected rejected evidence')
  expect(result.phase).toBe(phase)
  expect(result.issues.length).toBeGreaterThan(0)
  if (code) expect(result.issues.some((issue) => issue.code === code)).toBe(true)
  for (const issue of result.issues) {
    expect(Array.isArray(issue.path)).toBe(true)
    expect(issue.message.length).toBeGreaterThan(0)
  }
}

const cases = experiments.map((experiment) => {
  const base = success(createSearchBase(experiment.scenario))
  const searched = success(searchCounterexamples(experiment.oldContract, experiment.newContract, base, DEFAULT_SEARCH_OPTIONS))
  const witness = searched.witnesses[0]
  if (!witness) throw new Error('Expected actual retained search witness')
  const proof = success(proofApi.createImpactProof(experiment.oldContract, experiment.newContract, witness, DEFAULT_SEARCH_OPTIONS, { maxChecks: 200 }))
  return { experiment, proof }
})

function caseProof(index: number): ImpactProof {
  const selected = cases[index]
  if (!selected) throw new Error('Missing test experiment')
  return structuredClone(selected.proof)
}

function fileFor(proof: unknown, fileName = 'proof.json', type = 'application/json'): File {
  return new File([JSON.stringify(proof)], fileName, { type })
}

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

function nativeBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Test blob could not be read'))
    reader.readAsText(blob)
  })
}

describe('portable proof JSON export', () => {
  it.each(cases)('exports all evidence fields and round-trips $experiment.name through official APIs', ({ proof }) => {
    const verification = vi.spyOn(proofApi, 'verifyImpactProof')
    const exported = success(prepareProofJsonExport(proof))
    expect(verification).toHaveBeenCalledWith(proof)
    expect(exported.fileName).toBe('termshift-impact-proof.json')
    expect(exported.mimeType).toBe('application/json;charset=utf-8')
    expect(exported.text).toBe(JSON.stringify(success(proofApi.verifyImpactProof(proof)).proof, null, 2))
    const parsed: unknown = JSON.parse(exported.text)
    expect(proofApi.ImpactProofSchema.safeParse(parsed).success).toBe(true)
    expect(success(proofApi.verifyImpactProof(parsed)).proof).toEqual(proof)
    expect(Object.keys(parsed as object).sort()).toEqual(Object.keys(proof).sort())
    expect(parsed).toEqual(proof)
  })

  it('reverifies and rejects modified results before export', () => {
    const proof = caseProof(1)
    proof.minimizedComparison.deltaCents += 1
    const result = prepareProofJsonExport(proof)
    expect(result.success).toBe(false)
    expect(result).toEqual(proofApi.verifyImpactProof(proof))
    expect(result).not.toHaveProperty('data')
  })

  it.each([undefined, null, {}, 'Verified'])('rejects unverified export input %j', (proof) => {
    expect(prepareProofJsonExport(proof).success).toBe(false)
  })

  it('does not mutate the original complete proof', () => {
    const proof = caseProof(1)
    const snapshot = JSON.stringify(proof)
    prepareProofJsonExport(proof)
    expect(JSON.stringify(proof)).toBe(snapshot)
  })
})

describe('portable Markdown report export', () => {
  it.each(cases)('uses the official financial report for $experiment.name', ({ proof }) => {
    const formatter = vi.spyOn(proofApi, 'formatImpactReport')
    const exported = success(prepareMarkdownExport(proof))
    expect(formatter).toHaveBeenCalledWith(proof)
    expect(exported.fileName).toBe('termshift-impact-report.md')
    expect(exported.mimeType).toBe('text/markdown;charset=utf-8')
    expect(exported.text).toBe(success(proofApi.formatImpactReport(proof)))
    for (const title of ['Original Scenario', 'Minimized Scenario', 'Rule-Level Impact', 'Reduction Summary', 'Reproduction Information', 'Limitations']) {
      expect(exported.text).toContain(title)
    }
    expect(exported.text).toContain(`Search seed: ${proof.searchOptions.seed}`)
  })

  it('preserves original structured formatter errors without preparing a download', () => {
    const rejected = { success: false as const, issues: [{ code: 'proof_mismatch' as const, path: ['originalComparison'], message: 'Recorded comparison changed.' }] }
    vi.spyOn(proofApi, 'formatImpactReport').mockReturnValue(rejected)
    expect(prepareMarkdownExport(caseProof(1))).toBe(rejected)
    expect(prepareMarkdownExport(caseProof(1))).not.toHaveProperty('data')
  })

  it('rejects a forged delta through the real formatter', () => {
    const proof = caseProof(2)
    proof.originalComparison.deltaCents += 1
    expect(prepareMarkdownExport(proof)).toEqual(proofApi.formatImpactReport(proof))
    expect(prepareMarkdownExport(proof).success).toBe(false)
  })
})

describe('native file import and official verification', () => {
  it.each(cases)('reads a real File and independently verifies $experiment.name', async ({ proof }) => {
    const read = vi.spyOn(FileReader.prototype, 'readAsArrayBuffer')
    const verified = imported(await readAndVerifyProofFile(fileFor(proof)))
    expect(read).toHaveBeenCalledOnce()
    expect(verified.proof).toEqual(proof)
    expect(verified.verifiedComparisons).toBe(2 + proof.reductionSteps.length)
  })

  it('accepts valid embedded contracts unrelated to built-in experiment names', async () => {
    const proof = caseProof(1)
    proof.oldContract.name = 'Independent historical contract'
    proof.newContract.name = 'Another embedded contract'
    proof.oldContract.id = 'historical-old'
    proof.newContract.id = 'historical-new'
    for (const comparison of [proof.originalComparison, proof.minimizedComparison, ...proof.reductionSteps.map((step) => step.comparison)]) {
      comparison.oldEvaluation.contractId = 'historical-old'
      comparison.newEvaluation.contractId = 'historical-new'
    }
    const verified = imported(await readAndVerifyProofFile(fileFor(proof)))
    expect(verified.proof.oldContract.id).toBe('historical-old')
    expect(verified.proof.newContract.name).toBe('Another embedded contract')
  })

  it.each([
    ['untrusted.exe', 'application/octet-stream'],
    ['<script>alert(1)</script>.json', 'text/html'],
    ['x'.repeat(1000), ''],
  ])('does not use filename %s or MIME %s as verification authority', async (name, type) => {
    const verified = imported(await readAndVerifyProofFile(fileFor(caseProof(0), name, type)))
    expect(verified.proof).toEqual(caseProof(0))
    failure(await readAndVerifyProofFile(new File(['{"verified":true}'], name, { type })), 'import', 'validation_error')
  })

  it('rejects a missing file before allocating a reader', async () => {
    const read = vi.spyOn(FileReader.prototype, 'readAsArrayBuffer')
    failure(await readAndVerifyProofFile(undefined), 'import', 'missing_file')
    expect(read).not.toHaveBeenCalled()
  })

  it('rejects a file over 5 MiB before reading it', async () => {
    const read = vi.spyOn(FileReader.prototype, 'readAsArrayBuffer')
    const file = new File([new Uint8Array(MAX_IMPORT_BYTES + 1)], 'proof.json')
    failure(await readAndVerifyProofFile(file), 'import', 'file_too_large')
    expect(read).not.toHaveBeenCalled()
  })

  it('accepts a valid file exactly at the 5 MiB boundary', async () => {
    const text = JSON.stringify(caseProof(0))
    const size = bytes(text).byteLength
    const file = new File([text, ' '.repeat(MAX_IMPORT_BYTES - size)], 'proof.json')
    expect(file.size).toBe(MAX_IMPORT_BYTES)
    expect(imported(await readAndVerifyProofFile(file)).proof).toEqual(caseProof(0))
  })

  it('also checks actual read bytes if the declared size was misleading', async () => {
    const file = new File([new Uint8Array(MAX_IMPORT_BYTES + 1)], 'proof.json')
    Object.defineProperty(file, 'size', { value: 1 })
    failure(await readAndVerifyProofFile(file), 'import', 'file_too_large')
  })

  it.each([NaN, Infinity, -1, 1.5])('rejects invalid declared size %s without reading', async (size) => {
    const file = fileFor(caseProof(0))
    Object.defineProperty(file, 'size', { value: size })
    const read = vi.spyOn(FileReader.prototype, 'readAsArrayBuffer')
    failure(await readAndVerifyProofFile(file), 'import', 'invalid_file_size')
    expect(read).not.toHaveBeenCalled()
  })

  it.each(['', '{', '{"proofSchemaVersion":1,}', 'not json', '<script>alert(1)</script>'])('returns a structured JSON error for %j', async (text) => {
    failure(await readAndVerifyProofFile(new File([text], 'valid-proof.json', { type: 'application/json' })), 'import', 'invalid_json')
  })

  it.each([null, [], 1, true, 'verified', {}])('rejects a wrong JSON root %j', (root) => {
    failure(parseAndVerifyProofBytes(bytes(JSON.stringify(root))), 'import', 'validation_error')
  })

  it('rejects malformed UTF-8 instead of replacing corrupted bytes', async () => {
    failure(await readAndVerifyProofFile(new File([new Uint8Array([0xc3, 0x28])], 'proof.json')), 'import', 'invalid_utf8')
  })

  it('accepts legal UTF-8 BOM and harmless trailing whitespace', () => {
    const proof = caseProof(0)
    expect(imported(parseAndVerifyProofBytes(bytes(`\uFEFF${JSON.stringify(proof)}\n `))).proof).toEqual(proof)
  })

  it('preserves valid multi-byte UTF-8 names without corrupting embedded contracts', async () => {
    const proof = caseProof(0)
    proof.oldContract.name = '歷史 USD 合約 🧾'
    proof.newContract.name = 'Synthetic USD contract 新版本'
    expect(imported(await readAndVerifyProofFile(fileFor(proof))).proof).toEqual(proof)
  })

  it('does not invoke the verifier when the official schema rejects unknown root fields', () => {
    const verification = vi.spyOn(proofApi, 'verifyImpactProof')
    const proof = { ...caseProof(0), status: 'Verified', verified: true }
    failure(parseAndVerifyProofBytes(bytes(JSON.stringify(proof))), 'import', 'validation_error')
    expect(verification).not.toHaveBeenCalled()
  })

  it('rejects unsupported proof schema version', () => {
    const proof = { ...caseProof(0), proofSchemaVersion: 2 }
    const result = parseAndVerifyProofBytes(bytes(JSON.stringify(proof)))
    failure(result, 'import', 'validation_error')
    if (!result.success) expect(result.issues.some((issue) => issue.path[0] === 'proofSchemaVersion')).toBe(true)
  })

  it('rejects missing necessary embedded fields', () => {
    const { oldContract: omitted, ...incomplete } = caseProof(0)
    expect(omitted).toBeTruthy()
    failure(parseAndVerifyProofBytes(bytes(JSON.stringify(incomplete))), 'import', 'validation_error')
  })

  it('rejects forged monetary results after schema validation', async () => {
    const proof = caseProof(1)
    proof.minimizedComparison.newEvaluation.totalCents += 1
    expect(proofApi.ImpactProofSchema.safeParse(proof).success).toBe(true)
    failure(await readAndVerifyProofFile(fileFor(proof)), 'verification', 'proof_mismatch')
  })

  it('rejects a forged accepted reduction step after schema validation', async () => {
    const proof = caseProof(1)
    const step = proof.reductionSteps[0]
    if (!step) throw new Error('Expected actual accepted reduction')
    step.validation.deltaCents += 1
    expect(proofApi.ImpactProofSchema.safeParse(proof).success).toBe(true)
    failure(await readAndVerifyProofFile(fileFor(proof)), 'verification', 'proof_mismatch')
  })

  it('rejects altered preserved payment obligations', async () => {
    const proof = caseProof(2)
    const payment = proof.minimizedScenario.paymentEvents[0]
    if (!payment) throw new Error('Expected preserved payment')
    payment.amountCents += 1
    expect(proofApi.ImpactProofSchema.safeParse(proof).success).toBe(true)
    failure(await readAndVerifyProofFile(fileFor(proof)), 'verification', 'invariant_violation')
  })

  it('treats script-like contract text as inert data during verification', async () => {
    const proof = caseProof(0)
    proof.oldContract.name = '<script>globalThis.portableExecution = true</script>'
    const verified = imported(await readAndVerifyProofFile(fileFor(proof)))
    expect(verified.proof.oldContract.name).toBe(proof.oldContract.name)
    expect(globalThis).not.toHaveProperty('portableExecution')
  })

  it.each(['error', 'abort'])('handles native FileReader %s events', async (type) => {
    vi.spyOn(FileReader.prototype, 'readAsArrayBuffer').mockImplementation(function (this: FileReader) {
      this.dispatchEvent(new ProgressEvent(type))
    })
    failure(await readAndVerifyProofFile(fileFor(caseProof(0))), 'import', type === 'error' ? 'file_read_error' : 'file_read_aborted')
  })

  it('handles a native reader refusing the selected File', async () => {
    vi.spyOn(FileReader.prototype, 'readAsArrayBuffer').mockImplementation(() => {
      throw new DOMException('Unavailable file', 'NotReadableError')
    })
    failure(await readAndVerifyProofFile(fileFor(caseProof(0))), 'import', 'file_read_error')
  })

  it('handles an unexpected native reader result', async () => {
    vi.spyOn(FileReader.prototype, 'readAsArrayBuffer').mockImplementation(function (this: FileReader) {
      Object.defineProperty(this, 'result', { value: 'not an array buffer' })
      this.dispatchEvent(new ProgressEvent('load'))
    })
    failure(await readAndVerifyProofFile(fileFor(caseProof(0))), 'import', 'file_read_error')
  })

  it('returns a structured failure if official verification cannot complete', () => {
    vi.spyOn(proofApi, 'verifyImpactProof').mockImplementation(() => { throw new Error('Unexpected engine failure') })
    failure(parseAndVerifyProofBytes(bytes(JSON.stringify(caseProof(0)))), 'verification', 'verification_error')
  })

  it('is deterministic and does not mutate fixtures or issue network requests', async () => {
    const snapshots = JSON.stringify(experiments)
    const fetchSpy = vi.fn(() => { throw new Error('No runtime requests permitted') })
    vi.stubGlobal('fetch', fetchSpy)
    const first = await readAndVerifyProofFile(fileFor(caseProof(1)))
    const second = await readAndVerifyProofFile(fileFor(caseProof(1)))
    expect(first).toEqual(second)
    expect(JSON.stringify(experiments)).toBe(snapshots)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('native local Blob downloads', () => {
  function downloadSpies() {
    const create = vi.fn<((blob: Blob) => string)>(() => 'blob:termshift-test')
    const revoke = vi.fn<(url: string) => void>()
    const NativeURL = URL
    class TestURL extends NativeURL {
      static createObjectURL = create
      static revokeObjectURL = revoke
    }
    vi.stubGlobal('URL', TestURL)
    return { create, revoke }
  }

  it('downloads the exact JSON Blob and cleans the temporary anchor and Object URL', async () => {
    const payload = success(prepareProofJsonExport(caseProof(1)))
    const { create, revoke } = downloadSpies()
    let clicked = false
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked = true
      expect(document.body.contains(this)).toBe(true)
      expect(this.download).toBe(payload.fileName)
      expect(this.href).toBe('blob:termshift-test')
      expect(revoke).not.toHaveBeenCalled()
    })
    vi.useFakeTimers()
    downloadTextFile(payload)
    expect(clicked).toBeTruthy()
    expect(document.querySelector('a')).toBeNull()
    expect(create).toHaveBeenCalledOnce()
    expect(revoke).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:termshift-test')
    vi.useRealTimers()
    const blob = create.mock.calls[0]?.[0]
    if (!blob) throw new Error('Expected actual Blob')
    expect(blob.type).toBe(payload.mimeType)
    expect(await nativeBlobText(blob)).toBe(payload.text)
  })

  it('downloads the exact official Markdown report as a native Blob', async () => {
    const payload = success(prepareMarkdownExport(caseProof(2)))
    const { create, revoke } = downloadSpies()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    vi.useFakeTimers()
    downloadTextFile(payload)
    vi.runAllTimers()
    expect(revoke).toHaveBeenCalledOnce()
    vi.useRealTimers()
    const blob = create.mock.calls[0]?.[0]
    if (!blob) throw new Error('Expected actual Blob')
    expect(blob.type).toBe('text/markdown;charset=utf-8')
    expect(await nativeBlobText(blob)).toBe(success(proofApi.formatImpactReport(caseProof(2))))
    expect(document.querySelector('a')).toBeNull()
  })

  it('releases the Object URL and anchor when native click throws', () => {
    const { revoke } = downloadSpies()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { throw new Error('Click refused') })
    vi.useFakeTimers()
    expect(() => downloadTextFile(success(prepareProofJsonExport(caseProof(0))))).toThrow('Click refused')
    expect(document.querySelector('a')).toBeNull()
    vi.runAllTimers()
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:termshift-test')
  })

  it('releases its Object URL if anchor allocation fails', () => {
    const { revoke } = downloadSpies()
    vi.spyOn(document, 'createElement').mockImplementation(() => { throw new Error('DOM unavailable') })
    vi.useFakeTimers()
    const payload: TextDownload = { text: '{}', fileName: 'proof.json', mimeType: 'application/json' }
    expect(() => downloadTextFile(payload)).toThrow('DOM unavailable')
    vi.runAllTimers()
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:termshift-test')
  })

  it('still releases its Object URL if native anchor removal fails', () => {
    const { revoke } = downloadSpies()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    vi.spyOn(Element.prototype, 'remove').mockImplementation(() => { throw new Error('Removal refused') })
    vi.useFakeTimers()
    expect(() => downloadTextFile(success(prepareProofJsonExport(caseProof(0))))).toThrow('Removal refused')
    vi.runAllTimers()
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:termshift-test')
  })

  it('does not leave an anchor when native Blob URL creation fails', () => {
    const { create, revoke } = downloadSpies()
    create.mockImplementation(() => { throw new Error('Object URL unavailable') })
    expect(() => downloadTextFile(success(prepareMarkdownExport(caseProof(0))))).toThrow('Object URL unavailable')
    expect(document.querySelector('a')).toBeNull()
    expect(revoke).not.toHaveBeenCalled()
  })
})
