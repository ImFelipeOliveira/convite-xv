import { and, asc, eq, getTableColumns, isNull, ne, sql } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { gifts, guests, type Gift, type RsvpStatus } from '@/server/db/schema'

type GiftData = {
  name: string
  category: string
  priceCents: number | null
  imageUrl: string | null
  imageKey?: string | null
  purchaseUrl: string | null
  sortOrder?: number
}

export async function listGiftsAdmin(): Promise<
  Array<Gift & { reservedByName: string | null; reservedByStatus: RsvpStatus | null }>
> {
  const rows = await db
    .select({
      gift: gifts,
      reservedByName: guests.name,
      reservedByStatus: guests.rsvpStatus,
    })
    .from(gifts)
    .leftJoin(guests, eq(gifts.guestId, guests.id))
    .orderBy(asc(gifts.category), asc(gifts.sortOrder), asc(gifts.name))
  return rows.map((r) => ({
    ...r.gift,
    reservedByName: r.reservedByName,
    reservedByStatus: r.reservedByStatus,
  }))
}

/** The catalog as the invite shows it (same order as the admin table); reduce with toGiftViews before sending. */
export async function listGiftsForInvite(): Promise<Gift[]> {
  return db.select().from(gifts).orderBy(asc(gifts.category), asc(gifts.sortOrder), asc(gifts.name))
}

export async function createGift(d: GiftData): Promise<Gift> {
  const [row] = await db.insert(gifts).values(d).returning()
  return row
}

/**
 * Updates a gift and returns it with the photo key it had BEFORE this update, in one statement: the CTE
 * locks the row (FOR UPDATE), so two concurrent saves can't both see the same old key.
 */
export async function updateGiftReturningPreviousImageKey(
  id: string,
  d: GiftData,
): Promise<{ gift: Gift; previousImageKey: string | null } | null> {
  const old = db
    .$with('old')
    .as(
      db
        .select({ id: gifts.id, previousImageKey: sql<string | null>`${gifts.imageKey}`.as('previous_image_key') })
        .from(gifts)
        .where(eq(gifts.id, id))
        .for('update'),
    )
  const [row] = await db
    .with(old)
    .update(gifts)
    .set({ ...d, updatedAt: new Date() })
    .from(old)
    .where(eq(gifts.id, old.id))
    .returning({ ...getTableColumns(gifts), previousImageKey: old.previousImageKey })
  if (!row) return null
  const { previousImageKey, ...gift } = row
  return { gift, previousImageKey }
}

/** Whether any gift (other than `exceptId`) still uses this photo key. */
export async function isImageKeyReferenced(key: string, exceptId?: string): Promise<boolean> {
  const [row] = await db
    .select({ id: gifts.id })
    .from(gifts)
    .where(exceptId ? and(eq(gifts.imageKey, key), ne(gifts.id, exceptId)) : eq(gifts.imageKey, key))
    .limit(1)
  return !!row
}

export async function updateGift(id: string, d: GiftData): Promise<Gift | null> {
  const [row] = await db
    .update(gifts)
    .set({ ...d, updatedAt: new Date() })
    .where(eq(gifts.id, id))
    .returning()
  return row ?? null
}

/** Allowed even when reserved; returns the deleted row (null when it did not exist). */
export async function deleteGift(id: string): Promise<Gift | null> {
  const [row] = await db.delete(gifts).where(eq(gifts.id, id)).returning()
  return row ?? null
}

/** Atomic: the `guest_id IS NULL` guard makes concurrent reserves race-safe. */
export async function reserveGift(
  giftId: string,
  guestId: string,
): Promise<'reserved' | 'taken' | 'not_found'> {
  const rows = await db
    .update(gifts)
    .set({ guestId, reservedAt: sql`now()`, updatedAt: sql`now()` })
    .where(and(eq(gifts.id, giftId), isNull(gifts.guestId)))
    .returning({ id: gifts.id })
  if (rows.length > 0) return 'reserved'
  const [exists] = await db.select({ id: gifts.id }).from(gifts).where(eq(gifts.id, giftId)).limit(1)
  return exists ? 'taken' : 'not_found'
}

const FREE = { guestId: null, reservedAt: null, updatedAt: sql`now()` }

export async function releaseGift(giftId: string, guestId: string): Promise<boolean> {
  const rows = await db
    .update(gifts)
    .set(FREE)
    .where(and(eq(gifts.id, giftId), eq(gifts.guestId, guestId)))
    .returning({ id: gifts.id })
  return rows.length > 0
}

export async function adminReleaseGift(giftId: string): Promise<boolean> {
  const rows = await db
    .update(gifts)
    .set(FREE)
    .where(and(eq(gifts.id, giftId), sql`${gifts.guestId} is not null`))
    .returning({ id: gifts.id })
  return rows.length > 0
}

export async function guestHasGift(guestId: string): Promise<boolean> {
  const [row] = await db.select({ id: gifts.id }).from(gifts).where(eq(gifts.guestId, guestId)).limit(1)
  return !!row
}

/** For the admin summary: how many gifts exist and how many are reserved. */
export async function countGifts(): Promise<{ reserved: number; total: number }> {
  const [row] = await db
    .select({
      reserved: sql<number>`count(${gifts.guestId})::int`,
      total: sql<number>`count(*)::int`,
    })
    .from(gifts)
  return row
}
