/**
 * Test-only reference calculation from decimal percentages and dollar strings.
 * It deliberately imports no production model, rate, rounding, or engine helpers.
 */
function decimal(value: string): { numerator: bigint; denominator: bigint } {
  const match = /^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/.exec(value)
  if (!match) throw new Error('Expected a nonnegative plain decimal string.')
  const whole = match[1]
  if (whole === undefined) throw new Error('Missing decimal integer part.')
  const fraction = match[2] ?? ''
  return {
    numerator: BigInt(whole + fraction),
    denominator: 10n ** BigInt(fraction.length),
  }
}

function safe(value: bigint): number {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Reference result exceeds safe integer cents.')
  }
  return Number(value)
}

/** Round the proportional fee to cents before adding the exact fixed USD fee. */
export function referenceTransactionFee(
  amountCents: number,
  ratePercent: string,
  fixedUsd: string,
): number {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new Error('Expected positive safe integer transaction cents.')
  }
  const rate = decimal(ratePercent)
  const fixed = decimal(fixedUsd)
  const fixedNumerator = fixed.numerator * 100n
  if (fixedNumerator % fixed.denominator !== 0n) {
    throw new Error('The fixed USD fee must be an exact number of cents.')
  }
  const numerator = BigInt(amountCents) * rate.numerator
  const denominator = rate.denominator * 100n
  const quotient = numerator / denominator
  const remainder = numerator % denominator
  const rounded = quotient + (remainder * 2n >= denominator ? 1n : 0n)
  return safe(rounded + fixedNumerator / fixed.denominator)
}

/** Sum independently rounded per-transaction fees, never a rounded batch gross. */
export function referenceTotal(
  amountsCents: readonly number[],
  ratePercent: string,
  fixedUsd: string,
): number {
  return safe(amountsCents.reduce(
    (total, amount) => total + BigInt(referenceTransactionFee(amount, ratePercent, fixedUsd)),
    0n,
  ))
}
