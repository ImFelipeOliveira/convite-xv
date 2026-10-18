import { eq } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { settings, type Settings } from '@/server/db/schema'

export async function getSettings(): Promise<Settings> {
  await db.insert(settings).values({ id: 1 }).onConflictDoNothing()
  const [row] = await db.select().from(settings).where(eq(settings.id, 1))
  return row
}

export async function saveSettings(d: Partial<Omit<Settings, 'id'>>): Promise<Settings> {
  await db.insert(settings).values({ id: 1 }).onConflictDoNothing()
  if (Object.keys(d).length === 0) return getSettings()
  const [row] = await db.update(settings).set(d).where(eq(settings.id, 1)).returning()
  return row
}
