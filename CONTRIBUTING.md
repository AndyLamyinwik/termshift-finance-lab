# Contributing to TermShift

Thank you for helping improve TermShift. Use [GitHub Issues](https://github.com/AndyLamyinwik/termshift-finance-lab/issues) for reproducible bugs and focused proposals, and submit changes through pull requests.

## Development

Use Node.js 24 LTS and npm. Install the pinned dependencies with `npm ci`, then start the local application with `npm run dev`. See the [README](README.md) for project structure and model limitations.

Before submitting a pull request, run:

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

Do not commit `node_modules/`, `dist/`, secrets, or personal financial data. Use synthetic inputs in issues, tests, and examples.

## Reproducing a defect

Include the source commit, relevant contract/scenario inputs, seed and search/minimization options when applicable, steps to reproduce, and expected versus observed behavior. For calculation, schema, or proof defects, add a failing runtime regression test before fixing the cause. Preserve existing financial tests and formal fixture inputs.

Keep financial results derived from the official engine and proof APIs. Do not replace failures with zero values, loosen validation to make tests pass, or claim global optimality, contract equivalence, authenticated authorship, or real-world banking correctness beyond the documented model.

## Scope and review

Keep pull requests focused and explain the behavior changed, why it matters, and the checks performed. Update relevant documentation when a public data contract, algorithm policy, or user-facing behavior changes. Discuss schema or calculation-policy changes before implementing them so saved evidence is not silently reinterpreted.

Preserve the static, local-only architecture: no backend, bank connection, runtime external financial API, AI service, telemetry, or permanent browser storage of financial data. Use exact integer cents and basis points, deterministic core functions, strict Gregorian calendar dates, and explicit input/overflow errors.

Contributions are made under the project's [MIT License](LICENSE).
