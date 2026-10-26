# GitHub Pages deployment

TermShift is delivered as a static GitHub Pages website. Public availability and a Verified proof badge do not imply financial regulatory certification, digital signatures, or authenticated authorship.

The repository is [AndyLamyinwik/termshift-finance-lab](https://github.com/AndyLamyinwik/termshift-finance-lab). The verified [Live Demo](https://andylamyinwik.github.io/termshift-finance-lab/) is also available through the successful deployment's environment link or Repository Settings → Pages.

## Static hosting boundary

Vite produces `dist/` containing HTML, bundled JavaScript, CSS, and local assets. GitHub Pages serves these files without an application server. React, the financial engine, counterexample search, minimization, proof verification, and portable file import/export run locally in the visitor's browser.

There is no backend, database, login, AI/LLM integration, banking or external financial API, third-party tracking, remote font, external CDN, service worker, or PWA. Financial inputs and imported JSON are not uploaded. Workspace state stays in page memory, with no LocalStorage, SessionStorage, or IndexedDB persistence. Explicit downloads create local files under the visitor's control.

Fetching the site's own HTML, JavaScript, CSS, favicon, and local assets from GitHub Pages is normal page loading. It does not introduce an external financial API. npm installation and GitHub Actions may access the network during development and deployment.

## Repository setup

In Repository Settings → Pages, **Build and deployment → Source** must be **GitHub Actions**. If it is already configured correctly, retain that configuration and any existing domain settings. Enabling or changing this setting requires sufficient repository administration permissions; do not treat an inaccessible setting as completed.

The repository keeps `.github/workflows/ci.yml` for push and pull-request validation and adds `.github/workflows/deploy.yml` for public delivery. Deployment uses the built-in `GITHUB_TOKEN` and OIDC permissions; no Personal Access Token, private deployment token, or hardcoded secret is required.

The deployment job uses the `github-pages` environment. If environment protection requires an approval, review the waiting run and approve it through the environment's normal GitHub interface before expecting a live deployment. A queued or waiting run is not a completed deployment.

## Workflow and triggers

| Step | Behavior |
| --- | --- |
| Trigger | A push to `main`, or an explicit `workflow_dispatch` run. Pull requests do not publish. |
| Checkout and Node | Use immutable Action commit pins and the Node.js version in `.nvmrc`, currently Node.js 24 LTS. |
| Dependency installation | Run `npm ci` with the committed `package-lock.json`. |
| Verification | Run `npm run lint`, `npm run typecheck`, and `npm test`. |
| Production build | Run `npm run build`, which checks TypeScript and creates Vite output in `dist/`. |
| Static version metadata | Add `dist/build-info.json` with a `commit` field containing the full checked-out source commit SHA. No current-time value is required. |
| Pages artifact | Configure Pages and upload `dist/` with the official Pages artifact action. |
| Deployment | Use the official Pages deploy action in the `github-pages` environment. |

The workflow uses official `actions/checkout`, `actions/setup-node`, `actions/configure-pages`, `actions/upload-pages-artifact`, and `actions/deploy-pages` Actions. The workflow file records the exact supported versions and immutable SHA pins. Its build job receives `contents: read` and `pages: read` for source checkout and Pages configuration inspection; the deployment job receives `pages: write` and `id-token: write`. Deployment concurrency serializes publication and retains only the latest pending run, so an older run cannot finish after a newer deployment.

An ordinary CI success and a deployment success are separate checks. Publication requires the build and deployment jobs to succeed, a successful `github-pages` environment deployment, a Pages-provided URL, and public-site verification.

## Manual redeployment

1. Open Repository → Actions and select the Pages deployment workflow.
2. Choose **Run workflow**, select **main**, and confirm the run.
3. Wait for verification, artifact upload, and deployment to finish. Resolve any required environment approval through GitHub.
4. Open the deployment's official environment URL and confirm `build-info.json` matches the run's source commit SHA.
5. Repeat the public smoke checks below. If a newer main run superseded this one, verify the newest successful deployment instead.

A normal main push triggers the same sequence automatically. Do not use force push to redeploy, commit `dist/`, or create a separate Pages branch. Deployment does not create version tags or GitHub Releases; these are separate release operations.

## Project asset paths

`vite.config.ts` must retain:

```ts
base: '/termshift-finance-lab/'
```

The project is served under that repository subpath, rather than the domain root. `index.html` uses `%BASE_URL%termshift-mark.svg` for the favicon, allowing Vite to produce `/termshift-finance-lab/termshift-mark.svg`. Generated JS and CSS also use `/termshift-finance-lab/assets/…`.

The app navigates between Dashboard, Financial Diff, Counterexample Hunter, and Proof of Impact with in-memory state. It does not use React Router or deep URL routes. Deployment requires no `404.html` SPA fallback or routing dependency.

The PayPal published-rate case uses a separate static HTML entry at `/termshift-finance-lab/case-studies/paypal-usd/`. `npm run build` first regenerates its deterministic case data and evidence, then builds both entries into the same `dist/` Pages artifact. The case's graph, JSON and Markdown are local static files under that directory. Include its HTML, assets, downloads and JSON import smoke checks when verifying this delivery; `build-info.json` identifies the source of both entries.

For a local production preview, run `npm run build`, then `npx vite preview --host 127.0.0.1` to serve the built artifact. Use the printed URL with `/termshift-finance-lab/`. Local checks help diagnose problems, but public acceptance must use the deployed Pages URL.

## Verify current-version delivery

1. Record the latest main commit SHA and inspect the original CI run for that SHA.
2. Inspect the Pages workflow run for the same SHA. Confirm verification, upload, and deployment jobs succeeded.
3. Confirm the deployment environment is `github-pages` and the Pages source is GitHub Actions.
4. Use the official URL provided by the Pages deployment or repository settings. Confirm the public page and its JS, CSS, and favicon load without 404s.
5. Open `<official Pages URL>build-info.json` directly and compare its `commit` value with the full SHA from the successful workflow and main. This file is static build output; the application does not fetch it at runtime.
6. Perform the public browser checks below. Record incomplete checks or permission restrictions instead of claiming success from CI alone.

If browser or edge caches appear stale, request the metadata with a query string such as `?check=<expected commit SHA>` and reload the page with cache disabled. This cache-busting query is a verification aid, not proof by itself: the returned metadata must still contain the expected SHA. JS and CSS use Vite-generated content hashes. A successful deployment of a later documentation-only commit can still serve identical bundles, so the metadata is the source-version check.

## Public smoke checks

Perform these checks against the actual Pages website:

- **Basic load:** React mounts; HTML, JS, CSS, and favicon load successfully; no blank screen, serious console errors, or missing assets.
- **Dashboard:** Original fixtures show The Waiver Trap `+$12.00`, The Microtransaction Penalty `+$2.00`, and The Grace Period Shift `+$15.00`.
- **Financial Diff:** In The Waiver Trap, change the new purchase-total waiver threshold from `$500` to `$50` and Apply; the difference becomes `$0.00`. Change it to `$60` and Apply; the difference returns to `+$12.00`.
- **Counterexample Hunter:** Run the actual bounded search, select a nonzero-difference witness, and inspect its transactions and engine-provided fees.
- **Proof of Impact:** Generate a proof from that witness, inspect its original/reduced evidence, and obtain Verified from the official verifier.
- **Portable evidence:** Download JSON and Markdown, select the downloaded JSON locally, and obtain Verified imported proof. Change a recorded fee in a copy and confirm verification fails. Imported evidence must not overwrite the current workspace.
- **Responsive views:** Exercise all four views at 320, 390, 768, and 1440px without severe horizontal overflow or inaccessible controls.
- **Network and safety:** Inspect requests for site assets only; confirm there are no third-party financial calls, remote fonts/CDNs, uploads of evidence, or browser permanent storage of financial inputs. Inspect the built output for accidentally included secrets without exposing any credential in logs.

These are acceptance procedures, not an assertion that a particular run passed. Record observed results and run URLs when verifying a deployment.

## Troubleshooting

| Symptom | Checks and repair |
| --- | --- |
| Public page returns 404 | Confirm Pages Source is GitHub Actions, the deployment completed in `github-pages`, and the official URL includes `/termshift-finance-lab/`. A CI-only success does not publish the site. |
| HTML loads but JS/CSS return 404 or the screen is blank | Inspect the production HTML and network URLs. Restore the exact Vite base path, rebuild, and deploy again. Do not replace the base with `/` or use development `src/` URLs in production. |
| Favicon returns 404 | Confirm the local public asset exists and the HTML uses `%BASE_URL%termshift-mark.svg`. Inspect `dist/index.html` for the project-prefixed URL. |
| Pages deploy reports permissions or setup errors | Confirm Source is GitHub Actions, build has read access to contents, deployment has Pages write and OIDC access, and the job uses `github-pages`. Check environment protection rules. Never paste a password or token into an issue or chat. |
| Workflow is waiting or canceled | Check environment approvals and concurrency. A newer main deployment may supersede an older run. Verify the newest successful run and its SHA. |
| Public content appears older than main | Compare `build-info.json`, run SHA, and main; wait for the current deployment, use a cache-busting metadata request, and reload with cache disabled. Do not accept the page if the metadata remains mismatched. |
| Workflow tests or build fail | Fix the source error, rerun the five local checks, and push a regular corrective commit. No artifact should be published before required checks pass. |
| A copied nested URL returns 404 | Use the official project entry URL. View navigation is in memory and has no deep URL routes. Do not add routing or a fallback solely to fix an unsupported URL. |

Public hosting changes delivery only. Financial model limitations, USD integer-cent units, bounded search/minimization claims, and proof consistency semantics remain documented in the existing architecture and financial guides.
