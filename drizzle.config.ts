import { defineConfig } from 'drizzle-kit'

try {
  process.loadEnvFile('.env.local')
} catch {
  // no .env.local: fall back to the process environment
}

export default defineConfig({
  schema: './src/server/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
})
