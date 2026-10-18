import { eq } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { guests, type Guest } from '@/server/db/schema'
import { findGuestByToken } from '@/features/guests/repo'
import { normalizePhone } from '@/features/guests/phone'
import { getSettings } from '@/features/settings/repo'
import { syncRemindersForGuest } from '@/features/whatsapp/reminders'
import { logger } from '@/lib/logger'
import { isDeadlinePassed } from './deadline'
import { rsvpSchema } from './schema'

export type RsvpResult =
  | { ok: true; guest: Guest; phoneAdded: boolean }
  | {
      ok: false
      error: 'not_found' | 'deadline_passed' | 'over_limit' | 'invalid_phone' | 'invalid'
    }

export async function submitRsvp(input: unknown, now = new Date()): Promise<RsvpResult> {
  const parsed = rsvpSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }
  const data = parsed.data

  const guest = await findGuestByToken(data.token)
  if (!guest) return { ok: false, error: 'not_found' }

  const { rsvpDeadline } = await getSettings()
  if (isDeadlinePassed(rsvpDeadline, now)) return { ok: false, error: 'deadline_passed' }

  const plusOnes = data.status === 'no' ? 0 : data.plusOnes
  if (plusOnes > guest.plusOnesLimit) return { ok: false, error: 'over_limit' }

  let phone: string | undefined
  const rawPhone = data.phone?.trim()
  if (data.status === 'yes' && !guest.phone && rawPhone) {
    const normalized = normalizePhone(rawPhone)
    if (!normalized) return { ok: false, error: 'invalid_phone' }
    phone = normalized
  }

  const [updated] = await db
    .update(guests)
    .set({
      rsvpStatus: data.status,
      plusOnes,
      message: data.message ? data.message : null,
      respondedAt: now,
      updatedAt: now,
      ...(phone ? { phone } : {}),
    })
    .where(eq(guests.id, guest.id))
    .returning()

  // the answer is saved: a scheduling problem must not turn it into an error
  try {
    await syncRemindersForGuest(updated, now)
  } catch (err) {
    logger.error({ event: 'whatsapp.reminder_sync_failed', guestId: updated.id, err }, 'reminder sync failed')
  }
  return { ok: true, guest: updated, phoneAdded: Boolean(phone) }
}
