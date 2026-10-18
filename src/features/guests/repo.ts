import { and, asc, eq, ilike, inArray, isNull, ne, sql } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { guests, type Guest, type RsvpStatus } from '@/server/db/schema'
import { normalizePhone } from './phone'
import { generateToken, isValidToken } from './token'

export async function findGuestByToken(token: string): Promise<Guest | null> {
  if (!isValidToken(token)) return null
  const [row] = await db.select().from(guests).where(eq(guests.token, token)).limit(1)
  return row ?? null
}

export async function findGuestById(id: string): Promise<Guest | null> {
  const [row] = await db.select().from(guests).where(eq(guests.id, id)).limit(1)
  return row ?? null
}

/** Other guests with this phone (any input format; normalized to E.164), by name. */
export async function findGuestsByPhone(
  phone: string,
  excludeId?: string,
): Promise<Array<{ id: string; name: string }>> {
  const e164 = normalizePhone(phone)
  if (!e164) return []
  const conditions = [eq(guests.phone, e164)]
  if (excludeId) conditions.push(ne(guests.id, excludeId))
  return db
    .select({ id: guests.id, name: guests.name })
    .from(guests)
    .where(and(...conditions))
    .orderBy(asc(guests.name))
}

/** Guests holding any of these E.164 phones (the CSV import's duplicate check). */
export async function findGuestsByPhones(phones: string[]): Promise<Array<{ phone: string; name: string }>> {
  if (phones.length === 0) return []
  const rows = await db
    .select({ phone: guests.phone, name: guests.name })
    .from(guests)
    .where(inArray(guests.phone, phones))
    .orderBy(asc(guests.name))
  return rows.flatMap((r) => (r.phone ? [{ phone: r.phone, name: r.name }] : []))
}

/** Returns true when this call set openedAt (the first open). */
export async function markOpened(id: string): Promise<boolean> {
  const rows = await db
    .update(guests)
    .set({ openedAt: new Date() })
    .where(and(eq(guests.id, id), isNull(guests.openedAt)))
    .returning({ id: guests.id })
  return rows.length > 0
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null
  return e?.code === '23505' || e?.cause?.code === '23505'
}

export async function createGuest(d: {
  name: string
  phone?: string | null
  plusOnesLimit: number
}): Promise<Guest> {
  const insert = async () => {
    const [row] = await db
      .insert(guests)
      .values({
        token: generateToken(),
        name: d.name,
        phone: d.phone ?? null,
        plusOnesLimit: d.plusOnesLimit,
      })
      .returning()
    return row
  }
  try {
    return await insert()
  } catch (err) {
    if (!isUniqueViolation(err)) throw err
    return await insert()
  }
}

/** Inserts all guests or none (one transaction): used by the CSV import. */
export async function createGuests(
  rows: Array<{ name: string; phone: string | null; plusOnesLimit: number }>,
): Promise<number> {
  if (rows.length === 0) return 0
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(guests)
      .values(rows.map((r) => ({ ...r, token: generateToken() })))
      .returning({ id: guests.id })
    return inserted.length
  })
}

export async function updateGuest(
  id: string,
  d: Partial<{ name: string; phone: string | null; plusOnesLimit: number }>,
): Promise<Guest | undefined> {
  const [row] = await db
    .update(guests)
    .set({
      ...d,
      // keep the confirmed companions within a lowered limit
      ...(d.plusOnesLimit !== undefined
        ? { plusOnes: sql`least(${guests.plusOnes}, ${d.plusOnesLimit})` }
        : {}),
      updatedAt: sql`now()`,
    })
    .where(eq(guests.id, id))
    .returning()
  return row
}

export async function deleteGuest(id: string): Promise<void> {
  await db.delete(guests).where(eq(guests.id, id))
}

export async function listGuests(
  filter: { status?: RsvpStatus; search?: string } = {},
): Promise<Guest[]> {
  const conditions = []
  if (filter.status) conditions.push(eq(guests.rsvpStatus, filter.status))
  if (filter.search) {
    const escaped = filter.search.replace(/[\\%_]/g, '\\$&')
    conditions.push(ilike(guests.name, `%${escaped}%`))
  }
  return db
    .select()
    .from(guests)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(guests.name))
}

export async function getSummary(): Promise<{
  total: number
  yes: number
  no: number
  pending: number
  confirmedPeople: number
  /** pending guests if all of them came with every companion allowed: Σ (1 + plusOnesLimit) */
  pendingPeopleMax: number
  /** confirmedPeople + pendingPeopleMax */
  maxPossiblePeople: number
}> {
  const [r] = await db
    .select({
      total: sql<number>`count(*)::int`,
      yes: sql<number>`count(*) filter (where ${guests.rsvpStatus} = 'yes')::int`,
      no: sql<number>`count(*) filter (where ${guests.rsvpStatus} = 'no')::int`,
      pending: sql<number>`count(*) filter (where ${guests.rsvpStatus} = 'pending')::int`,
      confirmedPeople: sql<number>`coalesce(sum(1 + ${guests.plusOnes}) filter (where ${guests.rsvpStatus} = 'yes'), 0)::int`,
      pendingPeopleMax: sql<number>`coalesce(sum(1 + ${guests.plusOnesLimit}) filter (where ${guests.rsvpStatus} = 'pending'), 0)::int`,
    })
    .from(guests)
  return { ...r, maxPossiblePeople: r.confirmedPeople + r.pendingPeopleMax }
}
