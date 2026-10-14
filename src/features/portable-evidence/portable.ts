import {
  ImpactProofSchema,
  formatImpactReport,
  verifyImpactProof,
} from '../../proof'
import type { ImpactProofVerification } from '../../proof'

/** A file allocation limit, independent of the financial model's safe-integer limits. */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024

export interface PortableIssue {
  code: string
  path: (string | number)[]
  message: string
}

export type PortableResult<T> =
  | { success: true; data: T }
  | { success: false; issues: PortableIssue[] }

export type ImportResult =
  | { success: true; data: ImpactProofVerification }
  | { success: false; phase: 'import' | 'verification'; issues: PortableIssue[] }

export interface TextDownload {
  text: string
  fileName: string
  mimeType: string
}

function importFailure(code: string, message: string): ImportResult {
  return { success: false, phase: 'import', issues: [{ code, path: [], message }] }
}

/** Decode inert UTF-8 data, enforce the official schema, then recompute its evidence. */
export function parseAndVerifyProofBytes(input: ArrayBuffer | Uint8Array): ImportResult {
  if (input.byteLength > MAX_IMPORT_BYTES) {
    return importFailure('file_too_large', 'Proof JSON must be no larger than 5 MiB.')
  }

  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(input)
  } catch {
    return importFailure('invalid_utf8', 'The selected file must contain valid UTF-8 text.')
  }

  let inputProof: unknown
  try {
    inputProof = JSON.parse(text) as unknown
  } catch {
    return importFailure('invalid_json', 'The selected file does not contain valid JSON.')
  }

  const parsed = ImpactProofSchema.safeParse(inputProof)
  if (!parsed.success) {
    return {
      success: false,
      phase: 'import',
      issues: parsed.error.issues.map((issue) => ({
        code: 'validation_error',
        path: issue.path.map((part) => typeof part === 'number' ? part : String(part)),
        message: issue.message,
      })),
    }
  }

  try {
    const verified = verifyImpactProof(parsed.data)
    return verified.success ? verified : { ...verified, phase: 'verification' }
  } catch {
    return {
      success: false,
      phase: 'verification',
      issues: [{ code: 'verification_error', path: [], message: 'Proof verification could not complete.' }],
    }
  }
}

/** Inspect the size before allocating a read; filenames and MIME types confer no trust. */
export async function readAndVerifyProofFile(file: File | undefined): Promise<ImportResult> {
  if (!file) return importFailure('missing_file', 'Choose a local Proof JSON file to import.')
  if (!Number.isSafeInteger(file.size) || file.size < 0) {
    return importFailure('invalid_file_size', 'The selected file has an invalid size.')
  }
  if (file.size > MAX_IMPORT_BYTES) {
    return importFailure('file_too_large', 'Proof JSON must be no larger than 5 MiB.')
  }

  const read = await new Promise<PortableResult<ArrayBuffer>>((resolve) => {
    try {
      const reader = new FileReader()
      function finish(result: PortableResult<ArrayBuffer>) {
        reader.onload = null
        reader.onerror = null
        reader.onabort = null
        resolve(result)
      }
      reader.onload = () => {
        if (!(reader.result instanceof ArrayBuffer)) {
          finish({ success: false, issues: [{ code: 'file_read_error', path: [], message: 'The selected file could not be read as bytes.' }] })
          return
        }
        finish({ success: true, data: reader.result })
      }
      reader.onerror = () => finish({ success: false, issues: [{ code: 'file_read_error', path: [], message: 'The selected file could not be read.' }] })
      reader.onabort = () => finish({ success: false, issues: [{ code: 'file_read_aborted', path: [], message: 'Reading the selected file was interrupted.' }] })
      reader.readAsArrayBuffer(file)
    } catch {
      resolve({ success: false, issues: [{ code: 'file_read_error', path: [], message: 'The selected file could not be read.' }] })
    }
  })
  return read.success ? parseAndVerifyProofBytes(read.data) : { ...read, phase: 'import' }
}

/** Export a complete proof only after a fresh official verification. */
export function prepareProofJsonExport(proof: unknown): PortableResult<TextDownload> {
  const verified = verifyImpactProof(proof)
  if (!verified.success) return verified
  return {
    success: true,
    data: {
      text: JSON.stringify(verified.data.proof, null, 2),
      fileName: 'termshift-impact-proof.json',
      mimeType: 'application/json;charset=utf-8',
    },
  }
}

/** The existing formatter performs verification and owns every financial report field. */
export function prepareMarkdownExport(proof: unknown): PortableResult<TextDownload> {
  const report = formatImpactReport(proof)
  if (!report.success) return report
  return {
    success: true,
    data: {
      text: report.data,
      fileName: 'termshift-impact-report.md',
      mimeType: 'text/markdown;charset=utf-8',
    },
  }
}

/** Native local download. Release the URL on the next task after dispatching its click. */
export function downloadTextFile(payload: TextDownload): void {
  const blob = new Blob([payload.text], { type: payload.mimeType })
  const url = URL.createObjectURL(blob)
  let anchor: HTMLAnchorElement | undefined
  try {
    anchor = document.createElement('a')
    anchor.href = url
    anchor.download = payload.fileName
    document.body.append(anchor)
    anchor.click()
  } finally {
    try {
      anchor?.remove()
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 0)
    }
  }
}
