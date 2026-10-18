import { findGuestById } from '@/features/guests/repo'
import { syncGiftMessages } from '@/features/whatsapp/reminders'
import { logger } from '@/lib/logger'

/**
 * Runs once a guest's Pix turns `paid`: called by whichever path made the transition (the Asaas webhook
 * after its transaction commits, or the status poll fallback), never by both.
 * The guest now counts as having given (see guestHasPaidPix), so syncing their gift messages cancels
 * the pending `gift_list`/`gift_nudge` dispatches. Trigger `'gift'`: never (re)schedules `gift_list`.
 * Best effort: the caller catches and logs failures; a payment is never rolled back because of this.
 */
export async function afterPixPaid(guestId: string, now: Date = new Date()): Promise<void> {
  const guest = await findGuestById(guestId)
  if (!guest) return
  await syncGiftMessages(guest, now, 'gift')
  logger.info({ event: 'pix.after_paid', guestId }, 'pix after paid')
}

/**
 * Runs once when a paid Pix is refunded (the Asaas webhook, after its transaction commits). The refunded
 * Pix no longer counts as given (guestHasPaidPix), so syncing re-arms the `gift_nudge` when it is still
 * ahead (unless the guest gave in another way). Trigger `'gift'`: never re-sends `gift_list`.
 * Best effort: the caller catches and logs failures.
 */
export async function afterPixRefunded(guestId: string, now: Date = new Date()): Promise<void> {
  const guest = await findGuestById(guestId)
  if (!guest) return
  await syncGiftMessages(guest, now, 'gift')
  logger.info({ event: 'pix.after_refund', guestId }, 'pix after refund')
}
