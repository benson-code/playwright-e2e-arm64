import { defineConfig, devices } from '@playwright/test';

const WEB_PORT = 5273;
const API_PORT = 8281;
const isCI = !!process.env.CI;

export default defineConfig({
  // Where tests live. Playwright picks up *.spec.ts files under this folder.
  testDir: './tests',

  // A forgotten test.only would make CI run one test and report green. Fail instead.
  forbidOnly: isCI,

  // Locally 0: a failure you see is a failure you investigate, not one a retry hides.
  // In CI 2: one infrastructure hiccup should not block a merge, and the retry
  // records a trace (see `trace` below) so the flake can still be diagnosed.
  retries: isCI ? 2 : 0,

  // Parallel browser processes. This ARM box has ~12 GB shared with other services,
  // so 2 is the ceiling. All workers hit one in-memory API: a test that changes
  // balances must reset data first (POST /api/test/reset) or run serially.
  workers: 2,

  // Budget per test, and how long each expect() keeps retrying before it fails.
  timeout: 30_000,
  expect: { timeout: 5_000 },

  // `list` prints progress in the SSH terminal; `html` writes playwright-report/.
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    // Lets tests write page.goto('/') instead of repeating host and port.
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    // No display on this server; stated explicitly so nobody wonders.
    headless: true,
    // Full timeline (DOM snapshots, network, console) - only when a test is retried.
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      // Playwright's bundled Chromium. Do not set channel: 'chrome' -
      // Google ships no Chrome build for Linux ARM64, so it would fail to launch.
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Playwright starts both servers, waits for each URL to answer, and stops them afterwards.
  webServer: [
    {
      command: 'npm run api',
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      env: { API_PORT: String(API_PORT), ENABLE_TEST_HOOKS: '1' },
      // Never reuse: a server we did not start may be missing test hooks or hold
      // leftover data. Stop any manually started server before running tests.
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'npm run web',
      url: `http://127.0.0.1:${WEB_PORT}`,
      env: { API_PORT: String(API_PORT) },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
