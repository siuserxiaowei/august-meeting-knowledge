import { defineConfig, devices } from '@playwright/test';

const basePath = '/meeting-knowledge/';

export default defineConfig({
  testDir: './e2e',
  testIgnore: '**/real-content.spec.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:4321${basePath}`,
    trace: 'on-first-retry'
  },
  webServer: {
    command:
      'BASE_PATH=/meeting-knowledge MEETING_CONTENT_DIR=tests/fixtures/content SYNTHESIS_CONTENT_DIR=tests/fixtures/syntheses npm run build && BASE_PATH=/meeting-knowledge npm run preview:test',
    url: `http://127.0.0.1:4321${basePath}`,
    reuseExistingServer: false,
    timeout: 120_000
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'] }
    }
  ]
});
