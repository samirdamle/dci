import { defineConfig, devices } from '@playwright/test';
import type { DemoOptions } from './e2e/pages/fixtures';

const PORT = 5173;
const baseURL = `http://localhost:${PORT}`;
const isCI = !!process.env.CI;

/**
 * Chromium always runs. Firefox and WebKit are opt-in (`PW_ALL_BROWSERS=1`)
 * so local runs work with only the pre-installed Chromium.
 */
const allBrowsers = !!process.env.PW_ALL_BROWSERS;
/** Runtime perf budgets (`e2e/perf/*.perf.ts`) run only with `PW_PERF=1`. */
const perf = !!process.env.PW_PERF;
const perfFiles = /.*\.perf\.ts/;
/** Records docs/assets/demo.gif (`pnpm docs:gif`); needs visible streaming, so a real delay. */
const record = !!process.env.PW_RECORD;

export default defineConfig<DemoOptions>({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: record
    ? [
        {
          name: 'record',
          testMatch: /.*\.record\.ts/,
          retries: 0,
          use: { ...devices['Desktop Chrome'], trace: 'off' },
        },
      ]
    : perf
      ? [
          {
            name: 'perf',
            testMatch: perfFiles,
            fullyParallel: false,
            retries: 0,
            // Tracing snapshots every action and would skew frame timings.
            use: { ...devices['Desktop Chrome'], trace: 'off' },
          },
        ]
      : [
          { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
          // The selection gestures again with Control as the DCI modifier. Not on
          // macOS, where Ctrl+Click opens the context menu instead of clicking.
          ...(process.platform === 'darwin'
            ? []
            : [
                {
                  name: 'chromium-ctrl',
                  testMatch: /selection\.spec\.ts/,
                  use: { ...devices['Desktop Chrome'], modifier: 'Control' as const },
                },
              ]),
          ...(allBrowsers
            ? [
                { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
                { name: 'webkit', use: { ...devices['Desktop Safari'] } },
              ]
            : []),
        ],
  webServer: {
    command: `pnpm --filter @dci/demo dev --port ${PORT} --strictPort`,
    url: baseURL,
    reuseExistingServer: !isCI && !record,
    timeout: 120_000,
    // The demo backend in deterministic mock mode, with no artificial streaming delay
    // (except when recording the GIF, where the answer should visibly stream).
    env: { DCI_DEMO_MOCK: '1', DCI_DEMO_MOCK_DELAY: record ? '12' : '0' },
  },
});
