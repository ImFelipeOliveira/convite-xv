// Direct access to the e2e TEST database (playwright.config loads .env.local into every process).
import { and, eq, inArray, ne, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { guests, settings } from '../../src/server/db/schema'
import { E2E_GUEST_TOKEN } from './fixtures'

/** Puts the e2e guest back to "no answer yet, no phone" so each RSVP test starts clean. */
export async function resetE2eGuestRsvp(): Promise<void> {
  const url = process.env.DATABASE_URL_TEST
  if (!url) throw new Error('DATABASE_URL_TEST is not set')
  const client = postgres(url, { max: 1, onnotice: () => {} })
  try {
    await drizzle(client)
      .update(guests)
      .set({ rsvpStatus: 'pending', plusOnes: 0, message: null, phone: null, respondedAt: null })
      .where(eq(guests.token, E2E_GUEST_TOKEN))
  } finally {
    await client.end()
  }
}

/** Removes guests an e2e spec created (never the shared fixture guest). */
export async function deleteGuestsByName(names: string[]): Promise<void> {
  const url = process.env.DATABASE_URL_TEST
  if (!url) throw new Error('DATABASE_URL_TEST is not set')
  const client = postgres(url, { max: 1, onnotice: () => {} })
  try {
    await drizzle(client)
      .delete(guests)
      .where(and(inArray(guests.name, names), ne(guests.token, E2E_GUEST_TOKEN)))
  } finally {
    await client.end()
  }
}

/** Restores the settings row to its defaults (a spec that changes settings must call this). */
export async function resetE2eSettings(): Promise<void> {
  const url = process.env.DATABASE_URL_TEST
  if (!url) throw new Error('DATABASE_URL_TEST is not set')
  const client = postgres(url, { max: 1, onnotice: () => {} })
  try {
    await drizzle(client).execute(sql`DELETE FROM settings WHERE id = 1`)
    await drizzle(client).insert(settings).values({ id: 1 })
  } finally {
    await client.end()
  }
}
