import { describe, expect, it } from 'vitest'
import { MinimizationOptionsSchema } from '../../minimizer'
import { createMinimizationOptionsDraft, parseMinimizationOptionsDraft } from './options'

describe('Proof Viewer minimization option drafts', () => {
  it('uses the formal default of 200 and creates independent text drafts', () => {
    const first = createMinimizationOptionsDraft()
    const second = createMinimizationOptionsDraft()
    expect(first).toEqual({ maxChecks: '200' })
    expect(first).not.toBe(second)
    first.maxChecks = '1'
    expect(second.maxChecks).toBe('200')
    expect(parseMinimizationOptionsDraft(second)).toEqual({
      success: true, data: MinimizationOptionsSchema.parse({}),
    })
  })

  it.each([1, 2, 199, 200, 299, 300])('accepts canonical budget %s without alteration', (maxChecks) => {
    expect(parseMinimizationOptionsDraft({ maxChecks: String(maxChecks) })).toEqual({
      success: true, data: MinimizationOptionsSchema.parse({ maxChecks }),
    })
  })

  it.each([
    '', ' ', ' 1', '1 ', '1\n', '1\r\n', '0', '301', '-1', '+1', '01',
    '1.0', '1.5', '1e2', '0x10', 'NaN', 'Infinity', '1,000',
    '9007199254740992', '1'.repeat(25), '２００',
  ])('rejects invalid budget text %j with a useful associated field issue', (maxChecks) => {
    const result = parseMinimizationOptionsDraft({ maxChecks })
    expect(result.success).toBe(false)
    if (result.success) throw new Error('Expected invalid maxChecks')
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0]).toMatchObject({ path: ['maxChecks'] })
    expect(result.issues[0]?.code.length).toBeGreaterThan(0)
    expect(result.issues[0]?.message.length).toBeGreaterThan(0)
  })

  it.each([undefined, null, [], '', 1, NaN, Infinity])('safely rejects arbitrary root input %j', (input) => {
    expect(parseMinimizationOptionsDraft(input)).toMatchObject({ success: false })
  })

  it('requires the text field and rejects numeric values and unknown keys', () => {
    expect(parseMinimizationOptionsDraft({})).toMatchObject({ success: false, issues: [{ path: ['maxChecks'] }] })
    expect(parseMinimizationOptionsDraft({ maxChecks: 200 })).toMatchObject({ success: false, issues: [{ path: ['maxChecks'] }] })
    expect(parseMinimizationOptionsDraft({ maxChecks: '200', extra: true })).toMatchObject({
      success: false, issues: [{ path: [], code: 'unrecognized_keys' }],
    })
  })

  it('preserves frozen input and produces deterministic JSON-safe results', () => {
    const draft = Object.freeze(createMinimizationOptionsDraft())
    const before = JSON.stringify(draft)
    const result = parseMinimizationOptionsDraft(draft)
    expect(result).toEqual(parseMinimizationOptionsDraft(draft))
    expect(JSON.parse(JSON.stringify(result)) as unknown).toEqual(result)
    expect(JSON.stringify(draft)).toBe(before)
    const invalid = Object.freeze({ maxChecks: '1e2' })
    expect(parseMinimizationOptionsDraft(invalid)).toEqual(parseMinimizationOptionsDraft(invalid))
  })
})
