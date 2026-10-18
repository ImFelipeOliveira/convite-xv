// Playwright global setup: migrate and reset the TEST database, then seed the e2e fixtures.
// It truncates the same database vitest uses, so never run `pnpm test` and `pnpm test:e2e` at the same time.
import bcrypt from 'bcryptjs'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { admins, guests, settings } from '../../src/server/db/schema'
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_GUEST_NAME, E2E_GUEST_TOKEN } from './fixtures'

export default async function globalSetup() {
  const url = process.env.DATABASE_URL_TEST
  if (!url) throw new Error('DATABASE_URL_TEST is not set')

  const client = postgres(url, { max: 1, onnotice: () => {} })
  const db = drizzle(client)
  try {
    await migrate(db, { migrationsFolder: './drizzle' })
    await db.execute(sql`TRUNCATE guests, admins, settings RESTART IDENTITY CASCADE`)
    await db.insert(settings).values({ id: 1 })
    await db.insert(guests).values({ token: E2E_GUEST_TOKEN, name: E2E_GUEST_NAME, plusOnesLimit: 2 })
    await db.insert(admins).values({
      email: E2E_ADMIN_EMAIL,
      passwordHash: await bcrypt.hash(E2E_ADMIN_PASSWORD, 12),
    })
  } finally {
    await client.end()
  }
}
