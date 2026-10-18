// Direct access to the e2e TEST database (playwright.config loads .env.local into every process).
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { guests } from '../../src/server/db/schema'
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
