import { describe, expect, it } from 'vitest'
import { formatDeltaCents, formatUsdCents, getCostDirection } from './format'

describe('exact USD cents display', () => {
  it.each([
    [0, '$0.00'], [-0, '$0.00'], [1, '$0.01'], [9, '$0.09'], [10, '$0.10'],
    [99, '$0.99'], [100, '$1.00'], [101, '$1.01'], [1200, '$12.00'],
    [123456789, '$1,234,567.89'], [-1, '-$0.01'], [-1200, '-$12.00'],
    [Number.MAX_SAFE_INTEGER, '$90,071,992,547,409.91'],
    [-Number.MAX_SAFE_INTEGER, '-$90,071,992,547,409.91'],
  ])('formats %s cents as %s without losing precision', (cents, expected) => {
    expect(formatUsdCents(cents)).toBe(expected)
  })

  it.each([
    [0, '$0.00'], [-0, '$0.00'], [1, '+$0.01'], [200, '+$2.00'], [-200, '-$2.00'],
    [Number.MAX_SAFE_INTEGER, '+$90,071,992,547,409.91'],
    [-Number.MAX_SAFE_INTEGER, '-$90,071,992,547,409.91'],
  ])('formats a signed delta of %s as %s', (cents, expected) => {
    expect(formatDeltaCents(cents)).toBe(expected)
  })

  it.each([NaN, Infinity, -Infinity, 1.5, -1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid monetary display input %s instead of displaying a rounded answer', (cents) => {
      expect(() => formatUsdCents(cents)).toThrow(RangeError)
      expect(() => formatDeltaCents(cents)).toThrow(RangeError)
      expect(() => getCostDirection(cents)).toThrow(RangeError)
    },
  )

  it.each([
    [1200, 'increase', 'Cost increased'], [-1200, 'decrease', 'Cost decreased'],
    [0, 'equal', 'Same cost'], [-0, 'equal', 'Same cost'],
  ])('describes delta %s in words as well as a visual direction', (cents, kind, label) => {
    expect(getCostDirection(Number(cents))).toEqual({ kind, label })
  })
})
