// "Opened" = the guest's browser rendered the invite. It is recorded from the client after hydration
// (see markInviteOpenedAction): a server render alone is not an open, because link-preview fetchers
// (Evolution/WhatsApp building the card, chat apps, scanners) request the page without any person.
import { isLinkPreviewBot } from '@/lib/bots'
import { logger } from '@/lib/logger'
import { findGuestByToken, markOpened } from './repo'
import { isValidToken } from './token'

export type InviteOpenedResult = 'opened' | 'already_opened' | 'ignored'

/** Marks the guest's first open (idempotent). Bots, malformed and unknown tokens are ignored. */
export async function recordInviteOpened(token: string, userAgent: string): Promise<InviteOpenedResult> {
  if (typeof token !== 'string' || !isValidToken(token)) return 'ignored'
  if (isLinkPreviewBot(userAgent)) {
    logger.debug({ event: 'invite.preview_bot' }, 'invite preview bot skipped')
    return 'ignored'
  }
  const guest = await findGuestByToken(token)
  if (!guest) return 'ignored'
  const firstOpen = await markOpened(guest.id)
  logger.info({ event: 'invite.opened', guestId: guest.id, firstOpen }, 'invite opened')
  return firstOpen ? 'opened' : 'already_opened'
}
