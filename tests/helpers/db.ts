import { sql } from 'drizzle-orm'
import { generateToken } from '@/features/guests/token'
import { db } from '@/server/db/client'
import { guests, settings, type Guest, type NewGuest } from '@/server/db/schema'

export async function resetDatabase(): Promise<void> {
  await db.execute(sql`TRUNCATE guests, admins, settings, message_dispatches, gifts RESTART IDENTITY CASCADE`)
}

export async function reseedSettings(): Promise<void> {
  await db.insert(settings).values({ id: 1 }).onConflictDoNothing()
}

export async function makeGuest(overrides: Partial<NewGuest> = {}): Promise<Guest> {
  const [row] = await db
    .insert(guests)
    .values({
      token: generateToken(),
      name: 'Test Guest',
      plusOnesLimit: 2,
      ...overrides,
    })
    .returning()
  return row
}
