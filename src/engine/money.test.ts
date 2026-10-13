import { describe, expect, it } from 'vitest'
import { MoneyOverflowError, roundHalfUp, toSafeInteger } from './money'

describe('exact nonnegative half-up rounding', () => {
  it.each([
    { label: '0 cents', numerator: 0n, denominator: 10n, expected: 0n },
    { label: '0.4 cents rounds down', numerator: 4n, denominator: 10n, expected: 0n },
    { label: '0.5 cents rounds up', numerator: 5n, denominator: 10n, expected: 1n },
    { label: '0.6 cents rounds up', numerator: 6n, denominator: 10n, expected: 1n },
    { label: '1.5 cents rounds up', numerator: 15n, denominator: 10n, expected: 2n },
    { label: 'a whole cent stays exact', numerator: 10n, denominator: 10n, expected: 1n },
    { label: 'one third rounds down', numerator: 1n, denominator: 3n, expected: 0n },
    { label: 'two thirds rounds up', numerator: 2n, denominator: 3n, expected: 1n },
  ])('$label', ({ numerator, denominator, expected }) => {
    expect(roundHalfUp(numerator, denominator)).toBe(expected)
  })

  it('100 cents at 100 bps produces exactly 1 cent', () => {
    expect(roundHalfUp(100n * 100n, 10000n)).toBe(1n)
  })

  it('100 cents at 60 bps rounds 0.6 cents to 1 cent', () => {
    expect(roundHalfUp(100n * 60n, 10000n)).toBe(1n)
  })

  it('keeps a product above the safe number range exact at 10000 bps', () => {
    const amount = BigInt(Number.MAX_SAFE_INTEGER)
    expect(roundHalfUp(amount * 10000n, 10000n)).toBe(amount)
    expect(toSafeInteger(roundHalfUp(amount * 10000n, 10000n))).toBe(Number.MAX_SAFE_INTEGER)
  })

  it('rounds an exact half cent close to the safe amount boundary', () => {
    expect(roundHalfUp(9007199254740991n * 5000n, 10000n)).toBe(4503599627370496n)
  })

  it('preserves the exact result of a large amount at 9999 bps', () => {
    expect(roundHalfUp(9007199254740991n * 9999n, 10000n)).toBe(9006298534815517n)
  })

  it.each([
    { numerator: -1n, denominator: 10n },
    { numerator: 0n, denominator: 0n },
    { numerator: 1n, denominator: -1n },
  ])('rejects numerator $numerator and denominator $denominator', ({ numerator, denominator }) => {
    expect(() => roundHalfUp(numerator, denominator)).toThrow(RangeError)
  })
})

describe('safe integer conversion', () => {
  it.each([
    { value: 0n, expected: 0 },
    { value: 1n, expected: 1 },
    { value: -1n, expected: -1 },
    { value: 9007199254740991n, expected: Number.MAX_SAFE_INTEGER },
    { value: -9007199254740991n, expected: -Number.MAX_SAFE_INTEGER },
  ])('accepts the exact signed value $value', ({ value, expected }) => {
    const result = toSafeInteger(value)
    expect(result).toBe(expected)
    expect(Number.isSafeInteger(result)).toBe(true)
    expect(JSON.parse(JSON.stringify(result))).toBe(result)
  })

  it.each([9007199254740992n, -9007199254740992n, 10n ** 100n])('rejects unsafe value %s', (value) => {
    expect(() => toSafeInteger(value)).toThrow(MoneyOverflowError)
  })

  it('copies an overflow path and provides a readable error without a bigint property', () => {
    const path: (string | number)[] = ['trace', 2, 'chargedCents']
    let failure: unknown
    try {
      toSafeInteger(9007199254740992n, path)
    } catch (error) {
      failure = error
    }
    expect(failure).toBeInstanceOf(MoneyOverflowError)
    if (!(failure instanceof MoneyOverflowError)) throw new Error('Expected an overflow error')

    path.push('mutated')
    expect(failure.name).toBe('MoneyOverflowError')
    expect(failure.path).toEqual(['trace', 2, 'chargedCents'])
    expect(failure.message).toContain('outside the safe integer range')
    expect(() => JSON.stringify(failure)).not.toThrow()
  })

  it('uses an empty path by default', () => {
    const error = new MoneyOverflowError(9007199254740992n)
    expect(error.path).toEqual([])
  })
})
