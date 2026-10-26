import type { PayPalChartPoint } from './study'

/** Coordinates may be fractional; the plotted financial values are engine cents. */
export function renderPayPalFeeCurve(points: readonly PayPalChartPoint[]): string {
  if (!points.length) throw new Error('Cannot plot an empty PayPal fee curve.')
  const left = 78
  const top = 70
  const width = 820
  const height = 310
  const x = (cents: number) => (left + cents / 10000 * width).toFixed(2)
  const y = (cents: number) => (top + height - cents / 600 * height).toFixed(2)
  const line = (key: 'planACents' | 'planBCents') => points.map(point => `${x(point.amountCents)},${y(point[key])}`).join(' ')
  const horizontal = Array.from({ length: 7 }, (_, dollars) => {
    const coordinate = y(dollars * 100)
    return `<line x1="${left}" y1="${coordinate}" x2="${left + width}" y2="${coordinate}" stroke="#2d3c36"/><text x="${left - 14}" y="${Number(coordinate) + 5}" text-anchor="end">$${dollars}</text>`
  }).join('')
  const vertical = Array.from({ length: 6 }, (_, index) => {
    const dollars = index * 20
    const coordinate = x(dollars * 100)
    return `<text x="${coordinate}" y="${top + height + 28}" text-anchor="middle">$${dollars}</text>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="480" viewBox="0 0 960 480" role="img" aria-labelledby="title description">
<title id="title">PayPal US domestic USD: Plan A and Plan B modeled fees</title>
<desc id="description">Plan A Checkout uses 349 basis points plus 49 cents. Plan B Static Micropayments uses 499 basis points plus 9 cents. Sampled engine fees for one synthetic receipt from one cent to 100 dollars. Lines connect samples. Exact rounded values and assumptions appear in the accompanying table. This does not model Dynamic Micropayments or actual account charges.</desc>
<rect width="960" height="480" rx="16" fill="#0b100f"/>
<g fill="#d9e6dd" font-family="system-ui, sans-serif" font-size="15">
<text x="30" y="32" font-size="19" font-weight="600">Published schedules, one synthetic USD receipt</text>
<text x="20" y="61">Fee (USD)</text>${horizontal}${vertical}
<polyline points="${line('planACents')}" fill="none" stroke="#b6e5b8" stroke-width="3"/>
<polyline points="${line('planBCents')}" fill="none" stroke="#efbb88" stroke-width="3" stroke-dasharray="8 4"/>
<text x="488" y="434" text-anchor="middle">Receipt amount (USD)</text>
<line x1="115" y1="458" x2="145" y2="458" stroke="#b6e5b8" stroke-width="3"/><text x="155" y="463">A · Checkout</text>
<line x1="470" y1="458" x2="500" y2="458" stroke="#efbb88" stroke-width="3" stroke-dasharray="8 4"/><text x="510" y="463">B · Static Micropayments model</text>
</g></svg>\n`
}
