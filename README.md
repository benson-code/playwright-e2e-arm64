# playwright-e2e-arm64

[繁體中文](README.zh-TW.md)

A Playwright end-to-end test environment running headless on an ARM64 Linux server
(Oracle Cloud Ampere A1), with its own small system under test: **Quick Transfer**, a React
money-transfer form backed by a Node API.

The system is specified in full in **[docs/SPEC.md](docs/SPEC.md)** — business rules with
IDs, exact error messages, API contract and check order, boundary values, and the known
limitations left in on purpose. Tests are meant to trace back to those rule IDs.

## Status

| | |
|---|---|
| Environment | Working: Playwright starts both servers, runs headless Chromium, writes an HTML report |
| Tests | 1 smoke test, passing |
| Verified on | Ubuntu 24.04.4 LTS · aarch64 · Node 20.20.2 · Playwright 1.62.1 |
| Next | Functional test cases designed from the spec; GitHub Actions on an ARM64 runner |

```
Running 1 test using 1 worker
  ✓  1 [chromium] › tests/smoke.spec.ts:5:1 › home page loads and shows the balance from the API (1.6s)
  1 passed (5.5s)
```

## Stack

| Layer | Choice | Why |
|---|---|---|
| Test runner | `@playwright/test` 1.62.1 | Auto-waiting, tracing, and one API for browser and HTTP tests |
| Browser | Playwright's bundled Chromium | Google publishes no Chrome for Linux ARM64 |
| UI | React 19 + Vite 8 | Small, fast dev server with a built-in `/api` proxy |
| API | Node `node:http`, no framework | Nothing to explain beyond the rules themselves |
| Data | In memory, resettable | Every test run starts from known seed data |

All versions are pinned exactly in `package.json`.

## Project layout

```
.
├── api/server.js          API: health, accounts, transfers, test reset hook
├── shared/rules.js        Validation rules and messages, used by both UI and API
├── web/                   React UI (index.html, src/App.jsx, src/main.jsx)
├── tests/smoke.spec.ts    Smoke test
├── playwright.config.ts   Test configuration, every option commented
├── vite.config.js         Dev server on 5273, proxies /api to 8281
└── docs/SPEC.md           System specification (also docs/SPEC.zh-TW.md)
```

## Quick start

Requires Node **20.19 or newer** (Vite 8).

```bash
npm ci
npx playwright install chromium   # first time only; skipped if already cached
npm test
```

Playwright starts the API (with test hooks on) and the UI itself, runs the tests, then stops
both. Nothing needs to be running beforehand — and nothing should be, on ports 5273 or
8281 (see the config notes below).

On a fresh Ubuntu machine Chromium also needs system libraries:
`sudo npx playwright install-deps chromium`.

### Other commands

| Command | What it does |
|---|---|
| `npm test` | Run all tests |
| `npm run test:smoke` | Run only the smoke test |
| `npm run report` | Serve the last HTML report on `127.0.0.1:9323` |
| `npm run api` | Start the API alone (test hooks **off**) |
| `npm run web` | Start the UI alone |

### Viewing from another machine

Everything binds to `127.0.0.1`, so nothing is exposed on the server's public IP. To look at
the UI or the report from your own computer, forward the ports over SSH:

```bash
ssh -L 5273:127.0.0.1:5273 -L 9323:127.0.0.1:9323 user@server
```

Then open `http://localhost:5273` (after `npm run api` and `npm run web`) or
`http://localhost:9323` (after `npm run report`).

## Configuration decisions

Every option in `playwright.config.ts` has a comment; these are the ones worth knowing.

| Setting | Value | Reason |
|---|---|---|
| `projects[].use` | `devices['Desktop Chrome']`, no `channel` | `channel: 'chrome'` fails on Linux ARM64 — there is no Chrome build |
| `headless` | `true` | The server has no display |
| `workers` | `2` | The box has ~12 GB shared with other services |
| `retries` | `0` locally, `2` in CI | Locally a failure should be investigated, not retried away; in CI one hiccup should not block a merge |
| `trace` | `on-first-retry` | A retried test leaves a full timeline (DOM, network, console) to explain the flake |
| `forbidOnly` | on in CI | A committed `test.only` would otherwise run one test and report green |
| `webServer` | API + UI, `reuseExistingServer: false` | A server the suite did not start may lack test hooks or hold old data |
| Vite `strictPort` | `true` | If 5273 is taken, fail — do not silently test a different server |

### Test-writing conventions

- Locate by role and label first (`getByRole`, `getByLabel`); `data-testid` only for values
  with no accessible name. Never by CSS class.
- No `waitForTimeout`. Rely on auto-waiting and `expect` retries.
- A test that moves money calls `POST /api/test/reset` first and does not run in parallel
  with other money-moving tests — all workers share one API (SPEC L-05).
- Name the rule IDs a test covers, so coverage maps back to the spec.

## Design notes

- **One rules module.** `shared/rules.js` is imported by both the UI and the API, so they
  cannot drift apart. The API still re-checks every rule the UI checks.
- **The test hook is opt-in.** `POST /api/test/reset` exists only with `ENABLE_TEST_HOOKS=1`;
  otherwise it is an ordinary 404.
- **The smoke test checks data, not just the title.** A title check passes with the API
  down. Asserting the seeded balance (`30,000 TWD`) proves the UI, the proxy and the API are
  all working.
- **Known gaps are documented, not hidden.** No auth, no idempotency key, and a `10` vs
  `10.0` difference between UI and API are listed in SPEC §8 as test targets.

## Roadmap

- [x] Environment: Playwright, headless Chromium on ARM64, both servers managed by the config
- [x] System under test and specification
- [x] Smoke test
- [ ] Functional test cases from SPEC §4–§6 (validation, boundaries, error paths, network faults via `page.route`)
- [ ] API-level tests with Playwright's `request` fixture
- [ ] GitHub Actions on an ARM64 runner
