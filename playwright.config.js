// @ts-check
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 20_000,
  expect: { timeout: 5_000 },
  // Serial execution — vercel dev / serve is single-threaded and flakes under parallel load.
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3001',
    headless: true,
  },
  // Spins up a plain static-file server on 3001.
  // All /api/* calls are intercepted by page.route() in the tests — no API keys required.
  webServer: {
    command: 'npx serve -l 3001 --no-clipboard --cors',
    url: 'http://localhost:3001',
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
  },
});
