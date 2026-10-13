# TermShift

**Financial Contract Counterexample Lab**

TermShift is an explainable financial contract simulation and counterexample discovery engine. It aims to help people compare contract rules, discover scenarios where their outcomes differ, and understand the impact of those differences.

**Project in Development — Stage 1: Project Foundation**

This repository currently contains the frontend foundation and a responsive project overview. Financial calculations, contract simulation, and analysis results are not implemented yet.

## Technology

- React and TypeScript with strict type checking
- Vite for local development and production builds
- npm with a committed lockfile
- Vitest for automated tests
- ESLint for code quality
- GitHub Actions for continuous integration

The application is a single static frontend. It has no backend, database, authentication, or runtime third-party API calls. Future financial calculations will run locally in the browser. The interface uses local CSS and does not load remote fonts, images, or CDN assets.

## Getting started

Use Node.js 24 LTS and npm. The repository includes an `.nvmrc` containing `24` for environments that support it.

```sh
git clone https://github.com/AndyLamyinwik/termshift-finance-lab.git
cd termshift-finance-lab
npm ci
npm run dev
```

Open the local URL printed by Vite. Vite is configured with the base path `/termshift-finance-lab/` for the future GitHub Pages target.

## Development commands

| Command | Purpose |
| --- | --- |
| `npm ci` | Install the exact dependencies recorded in `package-lock.json`. |
| `npm run dev` | Start the local Vite development server. |
| `npm run build` | Produce the static production build in `dist/`. |
| `npm run lint` | Run ESLint. |
| `npm run typecheck` | Check TypeScript types without emitting JavaScript. |
| `npm test` | Run the Vitest suite once. |

Before committing changes, run:

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

The CI workflow runs this verification sequence on pushes and pull requests. Stage 1 does not include a deployment workflow.

## Current scope

- A React, TypeScript, and Vite application foundation.
- A responsive dark homepage with the TermShift name, product introduction, module descriptions, and a visible development status.
- A basic executable test suite, linting, type checking, and build scripts.
- Engineering documentation, an MIT license, and a GitHub Actions CI workflow.

The homepage is informational. It contains no unimplemented analysis controls or fabricated financial results.

## Planned modules

| Module | Intended role |
| --- | --- |
| Financial Diff | Compare financial contract rules and explain where simulated outcomes diverge. |
| Counterexample Hunter | Search explicit scenarios for examples that expose meaningful differences between contracts. |
| Proof of Impact | Trace the rules and calculations behind a difference so its effect can be explained. |

These modules are design targets for later stages. They are not available in Stage 1. Future monetary calculations will use integer minimum currency units with explicit validation and rounding rules.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the frontend constraints and planned module boundaries.

## License

TermShift is released under the [MIT License](LICENSE).
