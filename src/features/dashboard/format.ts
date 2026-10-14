function assertSafeCents(cents: number): void {
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError('USD cents must be a safe integer.')
  }
}

/** Display only: integer division preserves every cent, including large totals. */
export function formatUsdCents(cents: number): string {
  assertSafeCents(cents)
  const value = BigInt(cents)
  const magnitude = value < 0n ? -value : value
  const dollars = String(magnitude / 100n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const fraction = String(magnitude % 100n).padStart(2, '0')
  return `${value < 0n ? '-' : ''}$${dollars}.${fraction}`
}

export function formatDeltaCents(cents: number): string {
  return `${cents > 0 ? '+' : ''}${formatUsdCents(cents)}`
}

export function getCostDirection(deltaCents: number): {
  kind: 'increase' | 'decrease' | 'equal'
  label: string
} {
  assertSafeCents(deltaCents)
  if (deltaCents > 0) return { kind: 'increase', label: 'Cost increased' }
  if (deltaCents < 0) return { kind: 'decrease', label: 'Cost decreased' }
  return { kind: 'equal', label: 'Same cost' }
}
