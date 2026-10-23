import { defineConfig, devices } from '@playwright/test'

/** Tests contre la construction de production, sur une base locale dédiée à cette exécution. */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: {
    command: 'pnpm start --port 3100',
    url: 'http://localhost:3100/api/system/health',
    reuseExistingServer: false,
    env: {
      DATABASE_URL: '',
      DATABASE_URL_UNPOOLED: '',
      LOCAL_DATABASE_NAME: `e2e-${process.pid}`,
      BETTER_AUTH_URL: 'http://localhost:3100',
    },
    timeout: 60_000,
  },
})
