import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

try {
  process.loadEnvFile('.env.local')
} catch {
  // sem .env.local: usa o ambiente do processo
}

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    globalSetup: ['vitest.global-setup.ts'],
    setupFiles: ['vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    fileParallelism: false,
  },
})
