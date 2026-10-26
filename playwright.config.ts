import { defineConfig, devices } from '@playwright/test';

// End-to-end suite (bolt 17). Every test starts its own WeighingMS on a fresh copy of the seed
// data (playwright/support/stack.ts), so tests are independent and can run in any order.
export default defineConfig({
  testDir: 'playwright/tests',
  outputDir: 'test-results',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'STEP-29-playwright-report', open: 'never' }],
    ['json', { outputFile: 'STEP-29-results.json' }],
  ],
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 800 },
    video: { mode: 'on', size: { width: 1280, height: 800 } },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
