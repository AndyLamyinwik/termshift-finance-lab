// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import App from './App'

afterEach(cleanup)

describe('Project identity and honest development scope', () => {
  it('renders the project identity, development status, and local assets', () => {
    const { container } = render(<App />)

    expect(screen.getByLabelText('TermShift').textContent).toContain('TermShift')
    expect(screen.getByRole('heading', { name: 'Financial contract lab', level: 1 })).toBeTruthy()
    expect(container.textContent).toContain('Financial Contract')
    expect(container.textContent).toContain('Counterexample Lab')
    expect(screen.getByText('Project in Development')).toBeTruthy()
    expect(container.textContent).toContain(
      'An explainable financial contract simulation and counterexample discovery engine.',
    )

    for (const asset of container.querySelectorAll('[src]')) {
      expect(asset.getAttribute('src')).not.toMatch(/^(?:https?:)?\/\//)
    }
    expect(container.querySelector('script[src], iframe')).toBeNull()
  })

  it('marks future modules as planned while providing working Dashboard and Financial Diff views', () => {
    render(<App />)

    for (const name of ['Counterexample Hunter', 'Proof of Impact']) {
      const heading = screen.getByRole('heading', { name, level: 2 })
      const card = heading.parentElement
      expect(card).not.toBeNull()
      if (card === null) throw new Error(`Missing planned module card: ${name}`)
      expect(within(card).getByText(/Planned/)).toBeTruthy()
      expect(card.querySelector('button, a, input, select, textarea')).toBeNull()
    }

    const selector = screen.getByRole('combobox', { name: 'Experiment' })
    expect(selector.tagName).toBe('SELECT')
    const navigation = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(within(navigation).getByRole('button', { name: 'Dashboard' })).toBeTruthy()
    expect(within(navigation).getByRole('button', { name: 'Financial Diff' })).toBeTruthy()
    expect(screen.queryByText('Interactive calculations are not available here yet.')).toBeNull()
  })
})
