// Direct access to the e2e TEST database (playwright.config loads .env.local into every process).
import { and, eq, inArray, like, ne, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { guests, messageDispatches, settings } from '../../src/server/db/schema'
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

/**
 * Inserts `count` guests named `${prefix} 01`…; the first `confirmed` of them answered "yes".
 * Returns the names so the spec can delete them afterwards.
 */
export async function seedGuests(prefix: string, count: number, confirmed = 0): Promise<string[]> {
  const url = process.env.DATABASE_URL_TEST
  if (!url) throw new Error('DATABASE_URL_TEST is not set')
  const names = Array.from({ length: count }, (_, i) => `${prefix} ${String(i + 1).padStart(2, '0')}`)
  const client = postgres(url, { max: 1, onnotice: () => {} })
  try {
    // leftovers of an interrupted run would collide on token / duplicate the rows
    await drizzle(client)
      .delete(guests)
      .where(and(like(guests.name, `${prefix} %`), ne(guests.token, E2E_GUEST_TOKEN)))
    await drizzle(client)
      .insert(guests)
      .values(
        names.map((name, i) => ({
          name,
          // 22-char base62 tokens, unique per seeded guest
          token: `Seed${prefix.replace(/[^0-9A-Za-z]/g, '').slice(0, 8)}${String(i).padStart(4, '0')}`
            .padEnd(22, '0')
            .slice(0, 22),
          plusOnesLimit: 1,
          ...(i < confirmed ? { rsvpStatus: 'yes' as const, respondedAt: new Date() } : {}),
        })),
      )
  } finally {
    await client.end()
  }
  return names
}

/** Inserts one guest (phone in E.164 or null) with a random token; returns its id. */
export async function insertGuest(name: string, phone: string | null): Promise<string> {
  const url = process.env.DATABASE_URL_TEST
  if (!url) throw new Error('DATABASE_URL_TEST is not set')
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
  const token = Array.from({ length: 22 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')
  const client = postgres(url, { max: 1, onnotice: () => {} })
  try {
    const [row] = await drizzle(client)
      .insert(guests)
      .values({ name, phone, token, plusOnesLimit: 0 })
      .returning({ id: guests.id })
    return row.id
  } finally {
    await client.end()
  }
}

/** Inserts a dispatch row for a guest (history fixtures); returns its id. */
export async function insertDispatch(
  guestId: string,
  values: {
    kind: 'invite' | 'reminder_d7' | 'reminder_d1'
    status: 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled'
    errorCode?: string | null
    attempts?: number
    scheduledFor?: Date | null
    sentAt?: Date | null
  },
): Promise<string> {
  const url = process.env.DATABASE_URL_TEST
  if (!url) throw new Error('DATABASE_URL_TEST is not set')
  const client = postgres(url, { max: 1, onnotice: () => {} })
  try {
    const [row] = await drizzle(client)
      .insert(messageDispatches)
      .values({ guestId, ...values })
      .returning({ id: messageDispatches.id })
    return row.id
  } finally {
    await client.end()
  }
}
