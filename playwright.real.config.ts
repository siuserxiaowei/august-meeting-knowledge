import { defineConfig, devices } from '@playwright/test';

const basePath = '/meeting-knowledge/';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/real-content.spec.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/real' }]],
  use: {
    baseURL: `http://127.0.0.1:4322${basePath}`,
    trace: 'on-first-retry'
  },
  webServer: {
    command:
      'BASE_PATH=/meeting-knowledge SITE_URL=https://example.github.io npm run build && BASE_PATH=/meeting-knowledge PORT=4322 npm run preview:test',
    url: `http://127.0.0.1:4322${basePath}`,
    reuseExistingServer: false,
    timeout: 120_000
  },
  projects: [
    {
      name: 'real-chromium',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'real-mobile-chromium',
      use: { ...devices['Pixel 7'] }
    }
  ]
});
