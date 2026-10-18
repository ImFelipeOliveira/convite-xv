/**
 * Runs after a guest reserved or released a gift (best-effort: the caller swallows errors).
 * Task 4 fills this with syncGiftNudge(guestId) — cancel/reschedule the gift nudge.
 */
export async function afterGiftChange(guestId: string): Promise<void> {
  void guestId
}
