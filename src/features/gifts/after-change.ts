import { findGuestById } from '@/features/guests/repo'
import { syncGiftMessages } from '@/features/whatsapp/reminders'

/**
 * Runs after a guest reserved or released a gift (best-effort: the caller swallows errors):
 * reserving cancels the pending gift messages; releasing re-arms the gift nudge if still in its
 * window. Never called for an admin release (that does not re-arm anything).
 */
export async function afterGiftChange(guestId: string): Promise<void> {
  const guest = await findGuestById(guestId)
  if (!guest) return
  await syncGiftMessages(guest, new Date(), 'gift')
}
