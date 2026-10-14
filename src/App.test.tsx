// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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

  it('identifies the deployed public preview in the rendered footer', () => {
    render(<App />)

    const footer = screen.getByRole('contentinfo')
    expect(within(footer).getByText('Public Preview · Computed locally')).toBeTruthy()
    expect(within(footer).queryByText('Stage 5C-2 · Portable impact evidence')).toBeNull()
  })

  it('provides four working workspace views and an honest empty proof state', () => {
    render(<App />)

    expect(screen.getByRole('button', { name: 'Counterexample Hunter' })).toBeTruthy()
    const proof = screen.getByRole('button', { name: 'Proof of Impact' })
    expect(screen.queryByText('Planned')).toBeNull()

    const selector = screen.getByRole('combobox', { name: 'Experiment' })
    expect(selector.tagName).toBe('SELECT')
    const navigation = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(within(navigation).getByRole('button', { name: 'Dashboard' })).toBeTruthy()
    expect(within(navigation).getByRole('button', { name: 'Financial Diff' })).toBeTruthy()
    expect(screen.queryByText('Interactive calculations are not available here yet.')).toBeNull()
    fireEvent.click(proof)
    expect(screen.getByRole('heading', { name: 'Proof of Impact', level: 1 })).toBeTruthy()
    expect(screen.getByText('No witness selected. Run a counterexample search and select a witness first.')).toBeTruthy()
  })
})
