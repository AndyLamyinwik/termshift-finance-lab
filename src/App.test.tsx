import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('Stage 1 project overview', () => {
  it('renders the project identity and development status', () => {
    const html = renderToStaticMarkup(<App />)

    expect(html).toMatch(/<h1\b[^>]*>TermShift/)
    expect(html).toContain('Financial Contract')
    expect(html).toContain('Counterexample Lab')
    expect(html).toContain('Project in Development')
    expect(html).toContain(
      'An explainable financial contract simulation and counterexample discovery engine.',
    )
  })

  it('keeps every advertised module explicitly in the planned stage', () => {
    const html = renderToStaticMarkup(<App />)
    const cards = html.match(/<article\b[^>]*>[\s\S]*?<\/article>/g) ?? []

    expect(cards).toHaveLength(3)
    for (const [index, name] of [
      'Financial Diff',
      'Counterexample Hunter',
      'Proof of Impact',
    ].entries()) {
      expect(cards[index]).toContain(`<h3>${name}</h3>`)
      expect(cards[index]).toContain('Planned module')
    }
    expect(html).toContain('Interactive calculations are not available here yet.')
    expect(html).not.toMatch(/<(button|input|form|select|textarea)\b/)
  })
})
