'use server'

import { headers } from 'next/headers'
import { logger } from '@/lib/logger'
import { getClientIp, rateLimit } from '@/lib/rate-limit'
import { recordInviteOpened } from './opened'

/**
 * Called once by the invite page in the browser after hydration. Public (the token is the guest's
 * credential), rate-limited per client IP, never throws and answers nothing about the guest.
 */
export async function markInviteOpenedAction(token: string): Promise<void> {
  const h = await headers()
  if (!rateLimit(`opened:${getClientIp(h)}`, { max: 30, windowMs: 60_000 }).ok) {
    logger.warn({ event: 'rate_limit.exceeded', route: 'invite_opened' }, 'rate limit exceeded')
    return
  }
  try {
    await recordInviteOpened(token, h.get('user-agent') ?? '')
  } catch (err) {
    logger.error({ event: 'invite.opened_error', err }, 'invite open not recorded')
  }
}
