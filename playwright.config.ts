import { defineConfig, devices } from '@playwright/test'

try {
  process.loadEnvFile('.env.local')
} catch {
  // no .env.local: fall back to the process environment
}

const PORT = 3000
const APP_URL = `http://localhost:${PORT}`

// e2e runs against the TEST database (DATABASE_URL_TEST), which vitest also truncates:
// don't run `pnpm test` and `pnpm test:e2e` concurrently.
export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  use: {
    baseURL: APP_URL,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: APP_URL,
    // never reuse: a dev server on this port would point at the dev database
    reuseExistingServer: false,
    timeout: 240_000,
    env: {
      DATABASE_URL: process.env.DATABASE_URL_TEST ?? '',
      APP_URL,
    },
  },
})
