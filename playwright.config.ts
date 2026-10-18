import './tests/e2e/load-env'
import { defineConfig, devices } from '@playwright/test'
import { FAKE_EVOLUTION_API_KEY, FAKE_EVOLUTION_URL } from './tests/e2e/fake-evolution'
import { E2E_PORT } from './tests/e2e/fixtures'

const PORT = E2E_PORT
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
    // signs the admin in once and saves the cookie (tests/e2e/.auth/admin.json) for the admin specs
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } },
      dependencies: ['setup'],
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
      // fake Evolution API started by global-setup (tests/e2e/fake-evolution.ts)
      EVOLUTION_URL: FAKE_EVOLUTION_URL,
      EVOLUTION_API_KEY: FAKE_EVOLUTION_API_KEY,
      EVOLUTION_INSTANCE: 'convite-xv',
      // gift list, Pix section and their Closing shortcuts (tests/e2e/gifts.spec.ts, invite.spec.ts)
      FEATURES: 'gifts,pix',
    },
  },
})
