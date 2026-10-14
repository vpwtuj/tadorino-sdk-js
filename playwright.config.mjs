import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/browser',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: '.artifacts/browser-results.json' }]],
  outputDir: '.artifacts/browser',
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: [
    { command: 'node scripts/browser-fixture.mjs', url: 'http://127.0.0.1:5173', reuseExistingServer: false, timeout: 120_000 },
    { command: 'node scripts/m2m-browser-fixture.mjs', url: 'http://127.0.0.1:5174', reuseExistingServer: false, timeout: 120_000 },
  ],
});
