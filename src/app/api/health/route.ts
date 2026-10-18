import { sql } from 'drizzle-orm'
import { db } from '@/server/db/client'

// Liveness + database check used by the Railway health check.
export async function GET() {
  try {
    await db.execute(sql`select 1`)
    return Response.json({ ok: true })
  } catch {
    return Response.json({ ok: false }, { status: 503 })
  }
}
