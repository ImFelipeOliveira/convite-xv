// Direct access to the e2e TEST database (playwright.config loads .env.local into every process).
import { and, eq, inArray, like, ne, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { gifts, guests, messageDispatches, settings, type DispatchKind, type RsvpStatus } from '../../src/server/db/schema'
import { E2E_GUEST_TOKEN } from './fixtures'

/**
 * Puts the e2e guest back to "no answer yet, no phone" so each RSVP test starts clean
 * (and drops the reminders an answer scheduled for it).
 */
export async function resetE2eGuestRsvp(): Promise<void> {
  const url = process.env.DATABASE_URL_TEST
  if (!url) throw new Error('DATABASE_URL_TEST is not set')
  const client = postgres(url, { max: 1, onnotice: () => {} })
  try {
    const [guest] = await drizzle(client)
      .update(guests)
      .set({ rsvpStatus: 'pending', plusOnes: 0, message: null, phone: null, respondedAt: null })
      .where(eq(guests.token, E2E_GUEST_TOKEN))
      .returning({ id: guests.id })
    if (guest) await drizzle(client).delete(messageDispatches).where(eq(messageDispatches.guestId, guest.id))
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

/** Overrides settings fields (the spec must call resetE2eSettings afterwards). */
export async function setE2eSettings(values: Partial<Omit<typeof settings.$inferInsert, 'id'>>): Promise<void> {
  const url = process.env.DATABASE_URL_TEST
  if (!url) throw new Error('DATABASE_URL_TEST is not set')
  const client = postgres(url, { max: 1, onnotice: () => {} })
  try {
    await drizzle(client).insert(settings).values({ id: 1 }).onConflictDoNothing()
    await drizzle(client).update(settings).set(values).where(eq(settings.id, 1))
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
    kind: DispatchKind
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

/** Reserves the gift named `giftName` for the shared e2e guest (reset with resetE2eGuestRsvp / deleteGiftsByName). */
export async function reserveGiftForE2eGuest(giftName: string): Promise<void> {
  const url = process.env.DATABASE_URL_TEST
  if (!url) throw new Error('DATABASE_URL_TEST is not set')
  const client = postgres(url, { max: 1, onnotice: () => {} })
  try {
    const d = drizzle(client)
    const [guest] = await d.select({ id: guests.id }).from(guests).where(eq(guests.token, E2E_GUEST_TOKEN))
    if (!guest) throw new Error('e2e guest missing')
    await d.update(gifts).set({ guestId: guest.id, reservedAt: new Date() }).where(eq(gifts.name, giftName))
  } finally {
    await client.end()
  }
}

/** Sets the shared e2e guest's answer (the spec must call resetE2eGuestRsvp afterwards). */
export async function setE2eGuestRsvp(status: RsvpStatus): Promise<void> {
  const url = process.env.DATABASE_URL_TEST
  if (!url) throw new Error('DATABASE_URL_TEST is not set')
  const client = postgres(url, { max: 1, onnotice: () => {} })
  try {
    await drizzle(client)
      .update(guests)
      .set({ rsvpStatus: status, respondedAt: status === 'pending' ? null : new Date() })
      .where(eq(guests.token, E2E_GUEST_TOKEN))
  } finally {
    await client.end()
  }
}

/** Removes gifts an e2e spec created. */
export async function deleteGiftsByName(names: string[]): Promise<void> {
  const url = process.env.DATABASE_URL_TEST
  if (!url) throw new Error('DATABASE_URL_TEST is not set')
  const client = postgres(url, { max: 1, onnotice: () => {} })
  try {
    await drizzle(client).delete(gifts).where(inArray(gifts.name, names))
  } finally {
    await client.end()
  }
}

/** Reserved and total gift counts (to check the summary card regardless of other rows). */
export async function countGifts(): Promise<{ reserved: number; total: number }> {
  const url = process.env.DATABASE_URL_TEST
  if (!url) throw new Error('DATABASE_URL_TEST is not set')
  const client = postgres(url, { max: 1, onnotice: () => {} })
  try {
    const [row] = await drizzle(client)
      .select({
        reserved: sql<number>`count(${gifts.guestId})::int`,
        total: sql<number>`count(*)::int`,
      })
      .from(gifts)
    return row
  } finally {
    await client.end()
  }
}

type SeedGift = {
  name: string
  category: string
  priceCents?: number | null
  purchaseUrl?: string | null
  imageUrl?: string | null
  sortOrder?: number
}

/** Inserts gifts (replacing leftovers with the same names); the spec must delete them afterwards. */
export async function seedGifts(list: SeedGift[]): Promise<void> {
  const url = process.env.DATABASE_URL_TEST
  if (!url) throw new Error('DATABASE_URL_TEST is not set')
  const client = postgres(url, { max: 1, onnotice: () => {} })
  try {
    const d = drizzle(client)
    await d.delete(gifts).where(
      inArray(
        gifts.name,
        list.map((g) => g.name),
      ),
    )
    await d.insert(gifts).values(
      list.map((g) => ({
        name: g.name,
        category: g.category,
        priceCents: g.priceCents ?? null,
        purchaseUrl: g.purchaseUrl ?? null,
        imageUrl: g.imageUrl ?? null,
        sortOrder: g.sortOrder ?? 0,
      })),
    )
  } finally {
    await client.end()
  }
}

/** Inserts (or recreates) a guest with a fixed token; remove it with deleteGuestsByName. */
export async function insertGuestWithToken(name: string, token: string): Promise<void> {
  const url = process.env.DATABASE_URL_TEST
  if (!url) throw new Error('DATABASE_URL_TEST is not set')
  const client = postgres(url, { max: 1, onnotice: () => {} })
  try {
    const d = drizzle(client)
    await d.delete(guests).where(and(eq(guests.token, token), ne(guests.token, E2E_GUEST_TOKEN)))
    await d.insert(guests).values({ name, token, plusOnesLimit: 0 })
  } finally {
    await client.end()
  }
}
