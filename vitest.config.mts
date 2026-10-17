import { defineConfig } from 'vitest/config'

try {
  process.loadEnvFile('.env.local')
} catch {
  // no .env.local: fall back to the process environment
}

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    globalSetup: ['vitest.global-setup.ts'],
    setupFiles: ['vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    fileParallelism: false,
  },
})
