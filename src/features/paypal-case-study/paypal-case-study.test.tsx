// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as studyApi from '../../case-studies/paypal-usd'
import { paypalScenarios, paypalSource } from '../../case-studies/paypal-usd/fixtures'
import PayPalCaseStudy from './PayPalCaseStudy'
import App from '../../App'
import * as portable from '../portable-evidence/portable'
import { verifyImpactProof } from '../../proof'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('PayPal published-plan case-study page', () => {
  it('provides a project-path case entry from Dashboard without replacing its three experiments', () => {
    render(<App />)
    const entry = screen.getByRole('link', { name: 'Read the PayPal USD case study (opens in a new tab)' })
    expect(entry.getAttribute('href')).toBe(`${import.meta.env.BASE_URL}case-studies/paypal-usd/`)
    expect(entry.getAttribute('target')).toBe('_blank')
    expect(screen.getByRole('combobox', { name: 'Experiment' }).querySelectorAll('option')).toHaveLength(3)
    expect(within(screen.getByRole('article', { name: 'Cost Difference' })).getByText('+$12.00')).toBeTruthy()
  })

  it('introduces two A/B schedules and gives a real return path to the existing lab', () => {
    render(<PayPalCaseStudy />)
    expect(screen.getByRole('heading', { name: 'PayPal USD: two published plans', level: 1 })).toBeTruthy()
    expect(screen.getByRole('article', { name: 'Plan A: PayPal Checkout' }).textContent).toContain('3.49%')
    expect(screen.getByRole('article', { name: 'Plan B: Static Micropayments' }).textContent).toContain('4.99%')
    expect(screen.getByRole('link', { name: 'Return to the lab' }).getAttribute('href')).toBe(import.meta.env.BASE_URL)
    expect(screen.queryByRole('heading', { name: /Old Contract|New Contract/ })).toBeNull()
  })

  it('renders independently expected and actual engine fees for the $10 scenario', () => {
    render(<PayPalCaseStudy />)
    const row = screen.getByRole('row', { name: /1 × USD 10\.00/ })
    expect(within(row).getAllByText('$0.84')).toHaveLength(2)
    expect(within(row).getAllByText('$0.59')).toHaveLength(2)
    expect(within(row).getByText('-$0.25')).toBeTruthy()
    expect(within(row).getByText('Match')).toBeTruthy()
  })

  it('preserves the positive cost difference for the $30 scenario', () => {
    render(<PayPalCaseStudy />)
    const row = screen.getByRole('row', { name: /1 × USD 30\.00/ })
    expect(within(row).getAllByText('$1.54')).toHaveLength(2)
    expect(within(row).getAllByText('$1.59')).toHaveLength(2)
    expect(within(row).getByText('+$0.05')).toBeTruthy()
  })

  it.each(['26.66', '26.67'])('describes $%s as an equal-fee case without a fabricated nonzero proof', amount => {
    render(<PayPalCaseStudy />)
    const row = screen.getByRole('row', { name: new RegExp(`1 × USD ${amount.replace('.', '\\.')}`) })
    expect(within(row).getAllByText('$1.42')).toHaveLength(4)
    expect(within(row).getByText('Equal fees; no nonzero witness')).toBeTruthy()
    expect(within(row).queryAllByRole('link')).toHaveLength(0)
  })

  it('keeps repeated small transactions separate from a single equal-gross transaction', () => {
    render(<PayPalCaseStudy />)
    const row = screen.getByRole('row', { name: /10 × USD 1\.00/ })
    expect(within(row).getAllByText('$5.20')).toHaveLength(2)
    expect(within(row).getAllByText('$1.40')).toHaveLength(2)
    expect(within(row).getByText('-$3.80')).toBeTruthy()
    expect(within(row).getByText('$10.00')).toBeTruthy()
  })

  it('links each nonzero scenario to its full same-site JSON and Markdown evidence', () => {
    render(<PayPalCaseStudy />)
    for (const scenario of paypalScenarios) {
      if (scenario.expected.planACents === scenario.expected.planBCents) continue
      for (const [name, suffix] of [['JSON', 'proof.json'], ['Markdown', 'report.md']] as const) {
        const link = screen.getByRole('link', { name: `Download ${name} for ${scenario.label}` })
        expect(link.getAttribute('href')).toBe(`${import.meta.env.BASE_URL}case-studies/paypal-usd/${scenario.id}-${suffix}`)
        expect(link.hasAttribute('download')).toBe(true)
      }
    }
  })

  it('presents the source, date, Static eligibility and Dynamic distinction as part of the results', () => {
    render(<PayPalCaseStudy />)
    expect(screen.getByRole('link', { name: 'PayPal US merchant fee table' }).getAttribute('href')).toBe(paypalSource.url)
    expect(screen.getByRole('link', { name: 'PayPal US User Agreement: Micropayments' }).getAttribute('href')).toBe(paypalSource.termsUrl)
    expect(screen.getByText(paypalSource.capturedOn, { selector: 'dd' })).toBeTruthy()
    expect(screen.getByText(paypalSource.feePageUpdatedOn, { selector: 'dd' })).toBeTruthy()
    const eligibility = screen.getByRole('complementary', { name: 'Micropayments eligibility' })
    expect(eligibility.textContent).toContain('previously approved accounts')
    expect(eligibility.textContent).toContain('not every payment type is eligible')
    expect(eligibility.textContent).toContain('automatically chooses the applicable lower fee')
  })

  it('exposes accessible chart, table and keyboard-scroll controls plus an explicit rounding assumption', () => {
    render(<PayPalCaseStudy />)
    const chart = screen.getByRole('img', { name: /Fee curve for Plan A Checkout and Plan B Static Micropayments/ })
    expect(chart.getAttribute('src')).toBe(`${import.meta.env.BASE_URL}case-studies/paypal-usd/fee-curve.svg`)
    expect(screen.getByRole('region', { name: 'Scrollable comparison results' }).getAttribute('tabindex')).toBe('0')
    expect(screen.getByRole('table', { name: /independent expected fees and engine results/ })).toBeTruthy()
    expect(screen.getByText('Rounding is a model assumption:', { exact: true })).toBeTruthy()
    expect(screen.getByText(/Model totals are not verified real-account charges/)).toBeTruthy()
    expect(screen.getByText(/Import Proof JSON/)).toBeTruthy()
  })

  it('renders static results without network requests, uploads or storage writes', () => {
    const fetch = vi.fn()
    const store = vi.spyOn(Storage.prototype, 'setItem')
    vi.stubGlobal('fetch', fetch)
    const { container } = render(<PayPalCaseStudy />)
    expect(fetch).not.toHaveBeenCalled()
    expect(store).not.toHaveBeenCalled()
    expect(container.querySelector('input,form,iframe,script')).toBeNull()
    for (const asset of container.querySelectorAll('[src]')) {
      expect(asset.getAttribute('src')).not.toMatch(/^(?:https?:)?\/\//)
    }
  })

  it('shows a calculation failure rather than successful zero-cost data', () => {
    vi.spyOn(studyApi, 'buildPayPalCaseStudy').mockImplementation(() => { throw new Error('comparison failed') })
    render(<PayPalCaseStudy />)
    expect(screen.getByRole('alert').textContent).toContain('Financial results cannot be displayed')
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByText('Match')).toBeNull()
    expect(screen.queryByText('$0.00')).toBeNull()
    expect(screen.queryByRole('link', { name: /Download JSON/ })).toBeNull()
  })

  it('downloads complete freshly verified proof JSON through the native Blob helper', () => {
    const download = vi.spyOn(portable, 'downloadTextFile').mockImplementation(() => {})
    render(<PayPalCaseStudy />)
    fireEvent.click(screen.getByRole('link', { name: 'Download JSON for 1 × USD 10.00' }))
    expect(download).toHaveBeenCalledTimes(1)
    const payload = download.mock.calls[0]![0]
    expect(payload.fileName).toBe('usd-10-proof.json')
    expect(payload.mimeType).toContain('application/json')
    const proof: unknown = JSON.parse(payload.text)
    const verified = verifyImpactProof(proof)
    expect(verified.success).toBe(true)
    if (!verified.success) throw new Error('Downloaded proof failed verification')
    expect(verified.data.proof.originalComparison.deltaCents).toBe(-25)
  })

  it('downloads the verified readable A/B Markdown report through the native Blob helper', () => {
    const download = vi.spyOn(portable, 'downloadTextFile').mockImplementation(() => {})
    render(<PayPalCaseStudy />)
    fireEvent.click(screen.getByRole('link', { name: 'Download Markdown for 1 × USD 30.00' }))
    expect(download).toHaveBeenCalledTimes(1)
    const payload = download.mock.calls[0]![0]
    expect(payload.fileName).toBe('usd-30-report.md')
    expect(payload.mimeType).toContain('text/markdown')
    expect(payload.text).toContain('Plan A')
    expect(payload.text).toContain('Plan B')
    expect(payload.text).toContain('+$0.05')
    expect(payload.text).toContain('not a historical price change')
  })

  it('downloads curve, source and complete results as local payloads without a fetch', () => {
    const download = vi.spyOn(portable, 'downloadTextFile').mockImplementation(() => {})
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    render(<PayPalCaseStudy />)
    fireEvent.click(screen.getByRole('link', { name: 'Download fee curve (SVG)' }))
    expect(download).toHaveBeenCalledTimes(1)
    const curve = download.mock.calls[0]![0]
    expect(curve.mimeType).toContain('image/svg+xml')
    expect(curve.text).toContain('<svg')
    expect(curve.text).toContain('Plan A')
    expect(curve.text).toContain('Plan B')
    fireEvent.click(screen.getByRole('link', { name: 'Download source record' }))
    expect(download).toHaveBeenCalledTimes(2)
    expect(JSON.parse(download.mock.calls[1]![0].text)).toEqual(paypalSource)
    fireEvent.click(screen.getByRole('link', { name: 'Download all scenarios and comparison results (JSON)' }))
    expect(download).toHaveBeenCalledTimes(3)
    const results = JSON.parse(download.mock.calls[2]![0].text) as ReturnType<typeof studyApi.buildPayPalResultsDocument>
    expect(results.rows).toHaveLength(paypalScenarios.length)
    expect(results.source).toEqual(paypalSource)
    expect(results.contracts.planA.rules.transactionFee).toEqual({ rateBps: 349, fixedCents: 49 })
    expect(results.contracts.planB.rules.transactionFee).toEqual({ rateBps: 499, fixedCents: 9 })
    expect(results.rows.find(row => row.id === 'usd-10')?.comparison.deltaCents).toBe(-25)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does not download evidence when fresh proof creation or verification fails', () => {
    const download = vi.spyOn(portable, 'downloadTextFile').mockImplementation(() => {})
    vi.spyOn(studyApi, 'createPayPalEvidence').mockImplementation(() => { throw new Error('Proof verification failed') })
    render(<PayPalCaseStudy />)
    fireEvent.click(screen.getByRole('link', { name: 'Download JSON for 1 × USD 10.00' }))
    expect(download).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('Proof verification failed')
    expect(screen.getByRole('table')).toBeTruthy()
  })

  it('shows export failure without a fake download and lets a user retry', () => {
    const download = vi.spyOn(portable, 'downloadTextFile').mockImplementationOnce(() => { throw new Error('Native download unavailable') })
      .mockImplementation(() => {})
    render(<PayPalCaseStudy />)
    const link = screen.getByRole('link', { name: 'Download JSON for 1 × USD 10.00' })
    fireEvent.click(link)
    expect(screen.getByRole('alert').textContent).toContain('Unable to download')
    expect(screen.getByRole('table')).toBeTruthy()
    fireEvent.click(link)
    expect(download).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('retains normal modified-click behavior and static fallback addresses', () => {
    const download = vi.spyOn(portable, 'downloadTextFile').mockImplementation(() => {})
    render(<PayPalCaseStudy />)
    const link = screen.getByRole('link', { name: 'Download JSON for 1 × USD 10.00' })
    expect(link.getAttribute('href')).toBe(`${import.meta.env.BASE_URL}case-studies/paypal-usd/usd-10-proof.json`)
    // Inspect default behavior after React handles the click, then prevent jsdom's
    // unimplemented document navigation without changing the component's handler.
    const clicks: boolean[] = []
    const preventDocumentNavigation = (event: MouseEvent) => {
      clicks.push(event.defaultPrevented)
      event.preventDefault()
    }
    window.addEventListener('click', preventDocumentNavigation)
    try {
      for (const modifiers of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
        fireEvent.click(link, modifiers)
      }
    } finally {
      window.removeEventListener('click', preventDocumentNavigation)
    }
    expect(clicks).toEqual([false, false, false, false, false])
    expect(download).not.toHaveBeenCalled()
  })
})
