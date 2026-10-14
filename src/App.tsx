import Dashboard from './features/dashboard/Dashboard'
import './App.css'

const plannedModules = [
  { name: 'Financial Diff', description: 'Explore changes in contract terms.' },
  { name: 'Counterexample Hunter', description: 'Find scenarios that reveal a difference.' },
  { name: 'Proof of Impact', description: 'Inspect and reproduce the evidence.' },
] as const

function BrandMark() {
  return (
    <svg
      aria-hidden="true"
      className="brand-mark"
      width="32"
      height="32"
      viewBox="0 0 32 32"
      fill="none"
    >
      <path d="M5 9h17l-4-4M27 23H10l4 4" />
      <path d="m22 9-4 4M10 23l4-4" />
      <path className="brand-mark-muted" d="M5 16h22" />
    </svg>
  )
}

function App() {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#dashboard">Skip to content</a>

      <header className="app-header">
        <div className="brand" aria-label="TermShift">
          <BrandMark />
          <span>TermShift<span className="wordmark-period">.</span></span>
        </div>
        <span className="development-status">
          <span className="status-dot" aria-hidden="true" />
          Project in Development
        </span>
      </header>

      <div className="app-layout">
        <aside className="workspace-nav" aria-label="Workspace">
          <p className="eyebrow">Contract workspace</p>
          <nav aria-label="Main navigation">
            <a className="nav-current" href="#dashboard" aria-current="page">
              <span aria-hidden="true">◫</span> Dashboard
            </a>
          </nav>
          <div className="nav-planned">
            <p className="eyebrow">Planned interfaces</p>
            {plannedModules.map((module) => (
              <div key={module.name}>
                <h2>{module.name}</h2>
                <span className="status-pill">Planned</span>
                <p>{module.description}</p>
              </div>
            ))}
          </div>
          <p className="workspace-note">Local computation.<br />Explainable by design.</p>
        </aside>

        <Dashboard />
      </div>

      <footer className="site-footer">
        <div>
          <span>TermShift · Financial Contract Counterexample Lab</span>
          <p className="disclaimer">
            Synthetic financial experiments for research and education. Not financial advice.
          </p>
        </div>
        <span>Stage 5A · Local analysis</span>
      </footer>
    </div>
  )
}

export default App
