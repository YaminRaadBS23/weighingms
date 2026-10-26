import { defineConfig, devices } from '@playwright/test';

// Step 28: captures the prototype and the running application side by side. Not part of the
// end-to-end suite (no video, no report): `npx playwright test -c playwright.validation.config.ts`.
export default defineConfig({
  testDir: 'playwright/validation',
  outputDir: 'test-results/validation',
  timeout: 120_000,
  workers: 1,
  reporter: 'list',
  use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
