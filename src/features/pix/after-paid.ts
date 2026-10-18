import { logger } from '@/lib/logger'

/**
 * Runs once a guest's Pix turns `paid`: called by whichever path made the transition (the Asaas webhook
 * after its transaction commits, or the status poll fallback), never by both.
 * Best effort: the caller catches and logs failures; a payment is never rolled back because of this.
 */
export async function afterPixPaid(guestId: string): Promise<void> {
  // TODO(gifts-merge): call syncGiftMessages(guest, now, 'gift') (src/features/whatsapp/reminders.ts,
  // branch fase-3) to cancel the guest's gift nudge, loading the guest by id first.
  logger.info({ event: 'pix.after_paid', guestId }, 'pix after paid')
}
