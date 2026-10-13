import './App.css'

const modules = [
  {
    number: '01',
    name: 'Financial Diff',
    detail: 'Understand what changed.',
    description:
      'Compare contract terms and surface the financial rules behind each difference.',
    icon: 'diff',
  },
  {
    number: '02',
    name: 'Counterexample Hunter',
    detail: 'Find where assumptions break.',
    description:
      'Explore scenarios that reveal when a change in contract terms can lead to a different outcome.',
    icon: 'search',
  },
  {
    number: '03',
    name: 'Proof of Impact',
    detail: 'Follow the reasoning.',
    description:
      'Trace an outcome back to the rules and inputs that produced it, with an explanation you can inspect.',
    icon: 'proof',
  },
] as const

function ModuleIcon({ kind }: { kind: (typeof modules)[number]['icon'] }) {
  return (
    <svg
      aria-hidden="true"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {kind === 'diff' && (
        <>
          <path d="M5 5h14M5 12h5M14 12h5M5 19h14" />
          <path d="m9 9 3 3-3 3m6-6-3 3 3 3" />
        </>
      )}
      {kind === 'search' && (
        <>
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m15.5 15.5 5 5M8 10.5h5M10.5 8v5" />
        </>
      )}
      {kind === 'proof' && (
        <>
          <path d="M7 3h8l4 4v14H5V3h2ZM14 3v5h5" />
          <path d="m8 14 2 2 5-5" />
        </>
      )}
    </svg>
  )
}

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
    <div className="site-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <header className="site-header">
        <div className="wordmark" aria-label="TermShift">
          <BrandMark />
          <span>TermShift<span className="wordmark-period">.</span></span>
        </div>
        <div className="development-status">
          <span className="status-dot" aria-hidden="true" />
          Project in Development
        </div>
      </header>

      <main id="main-content">
        <section className="hero" aria-labelledby="project-title">
          <div className="hero-copy">
            <p className="eyebrow"><span aria-hidden="true" /> Financial systems, made explainable</p>
            <h1 id="project-title">TermShift<span className="title-period">.</span></h1>
            <p className="hero-subtitle">Financial Contract<br className="subtitle-break" /> Counterexample Lab</p>
            <p className="hero-description">
              An explainable financial contract simulation and counterexample discovery engine.
            </p>
            <div className="foundation-note">
              <span className="foundation-number" aria-hidden="true">01</span>
              <div>
                <span className="foundation-label">The foundation is taking shape</span>
                <p>Stage 1 establishes the project. Financial simulation and analysis are planned for future stages.</p>
              </div>
            </div>
          </div>

          <aside className="workflow" aria-labelledby="workflow-title">
            <div className="workflow-heading">
              <span className="eyebrow">The intended workflow</span>
              <span className="planned-tag">Planned</span>
            </div>
            <h2 id="workflow-title">From terms<br />to understanding.</h2>
            <div className="workflow-diagram">
              <div className="contract-pair">
                <div className="contract-node">
                  <span className="node-label">Contract A</span>
                  <div className="contract-lines" aria-hidden="true"><span /><span /><span /></div>
                  <span className="node-caption">Original terms</span>
                </div>
                <span className="versus" aria-hidden="true">↔</span>
                <div className="contract-node">
                  <span className="node-label">Contract B</span>
                  <div className="contract-lines alternate" aria-hidden="true"><span /><span /><span /></div>
                  <span className="node-caption">Changed terms</span>
                </div>
              </div>
              <div className="workflow-connector" aria-hidden="true"><span /></div>
              <div className="reasoning-node">
                <span className="reasoning-symbol" aria-hidden="true">≠</span>
                <div>
                  <span className="node-label">Explore the difference</span>
                  <span className="node-caption">Rules · Scenarios · Explanations</span>
                </div>
              </div>
            </div>
            <p className="workflow-footnote">
              A conceptual preview of future modules.<br />No financial calculations are available yet.
            </p>
          </aside>
        </section>

        <section className="modules-section" aria-labelledby="modules-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">What comes next</p>
              <h2 id="modules-title">Three modules. One explainable path.</h2>
            </div>
            <span className="roadmap-label">Future development</span>
          </div>
          <div className="module-grid">
            {modules.map((module) => (
              <article className="module-card" key={module.name}>
                <div className="module-card-top">
                  <span className="module-icon"><ModuleIcon kind={module.icon} /></span>
                  <span className="module-number" aria-hidden="true">/{module.number}</span>
                </div>
                <h3>{module.name}</h3>
                <p className="module-detail">{module.detail}</p>
                <p className="module-description">{module.description}</p>
                <span className="module-status"><span aria-hidden="true" /> Planned module</span>
              </article>
            ))}
          </div>
        </section>

        <section className="principles" aria-label="Project principles">
          <p>Built for transparency.<span>Designed for local computation.</span></p>
          <div className="principle-tags">
            <span>Open source</span>
            <span>Browser based</span>
            <span>Explainable by design</span>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <span>TermShift <span className="footer-divider" aria-hidden="true">/</span> Financial Contract Counterexample Lab</span>
        <span className="footer-stage">Stage 1 · Project foundation</span>
      </footer>
    </div>
  )
}

export default App
