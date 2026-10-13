const MAX_SAFE_INTEGER = BigInt(Number.MAX_SAFE_INTEGER)

/** Exact half-up rounding of a nonnegative rational value. */
export function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (numerator < 0n) {
    throw new RangeError('Half-up rounding requires a nonnegative numerator.')
  }
  if (denominator <= 0n) {
    throw new RangeError('Half-up rounding requires a positive denominator.')
  }

  const whole = numerator / denominator
  const remainder = numerator % denominator
  return whole + (remainder * 2n >= denominator ? 1n : 0n)
}

/** Expected calculation failure when a JSON number would lose integer precision. */
export class MoneyOverflowError extends Error {
  readonly path: (string | number)[]

  constructor(value: bigint, path: (string | number)[] = []) {
    super(`Calculated value ${value.toString()} is outside the safe integer range (-${MAX_SAFE_INTEGER.toString()} to ${MAX_SAFE_INTEGER.toString()}).`)
    this.name = 'MoneyOverflowError'
    this.path = [...path]
  }
}

/** Convert to a JSON-safe integer only after checking both signed boundaries. */
export function toSafeInteger(value: bigint, path: (string | number)[] = []): number {
  if (value < -MAX_SAFE_INTEGER || value > MAX_SAFE_INTEGER) {
    throw new MoneyOverflowError(value, path)
  }
  return Number(value)
}
