'use server'

import { headers } from 'next/headers'
import { z } from 'zod'
import { isFeatureEnabled } from '@/features/event/flags'
import { findGuestByToken } from '@/features/guests/repo'
import { logger } from '@/lib/logger'
import { getClientIp, rateLimit } from '@/lib/rate-limit'
import { afterGiftChange } from './after-change'
import { listGiftsForInvite, releaseGift, reserveGift } from './repo'
import { toGiftViews, type GiftView } from './view'

// Public gift actions for the invite: keyed by the guest token (never ids of guests from the client),
// rate limited per IP, and answering only free | mine | taken views (never who reserved what).

export type GiftActionResult =
  | { ok: true; gifts: GiftView[] }
  | { ok: false; error: 'not_found' | 'taken' | 'invalid'; gifts?: GiftView[] }

const idSchema = z.uuid()

function field(formData: FormData, name: string): string {
  const v = formData.get(name)
  return typeof v === 'string' ? v : ''
}

async function views(guestId: string): Promise<GiftView[]> {
  return toGiftViews(await listGiftsForInvite(), guestId)
}

async function notifyChange(guestId: string): Promise<void> {
  try {
    await afterGiftChange(guestId)
  } catch (err) {
    logger.error({ event: 'gift.after_change_failed', guestId, err }, 'gift after-change hook failed')
  }
}

type Op = 'reserve' | 'release'

async function run(op: Op, formData: FormData): Promise<GiftActionResult> {
  const ip = getClientIp(await headers())
  if (!rateLimit(`gift:${ip}`, { max: 20, windowMs: 60_000 }).ok) {
    logger.warn({ event: 'rate_limit.exceeded', route: 'gift' }, 'rate limit exceeded')
    return { ok: false, error: 'invalid' }
  }
  // defense in depth: the section is not rendered with the flag off, but the actions stay reachable
  if (!isFeatureEnabled('gifts')) {
    logger.warn({ event: `gift.${op}_rejected`, reason: 'feature_disabled' }, 'gift action rejected')
    return { ok: false, error: 'invalid' }
  }
  try {
    const guest = await findGuestByToken(field(formData, 'token'))
    if (!guest) {
      logger.warn({ event: `gift.${op}_rejected`, reason: 'not_found' }, 'gift action rejected')
      return { ok: false, error: 'not_found' }
    }
    const giftId = field(formData, 'giftId')
    if (!idSchema.safeParse(giftId).success) {
      logger.warn({ event: `gift.${op}_rejected`, guestId: guest.id, reason: 'invalid' }, 'gift action rejected')
      return { ok: false, error: 'invalid', gifts: await views(guest.id) }
    }

    if (op === 'reserve') {
      const outcome = await reserveGift(giftId, guest.id)
      if (outcome !== 'reserved') {
        const list = await views(guest.id)
        // already this guest's (reserved in another tab): nothing changed, but it is theirs
        if (list.some((g) => g.id === giftId && g.state === 'mine')) return { ok: true, gifts: list }
        logger.info({ event: 'gift.reserve_rejected', guestId: guest.id, giftId, reason: outcome }, 'gift reserve rejected')
        return { ok: false, error: outcome === 'taken' ? 'taken' : 'invalid', gifts: list }
      }
    } else if (!(await releaseGift(giftId, guest.id))) {
      // not this guest's reservation (or already free / deleted): nothing changes
      logger.info({ event: 'gift.release_rejected', guestId: guest.id, giftId }, 'gift release rejected')
      return { ok: false, error: 'invalid', gifts: await views(guest.id) }
    }

    logger.info({ event: op === 'reserve' ? 'gift.reserved' : 'gift.released', guestId: guest.id, giftId }, 'gift changed')
    await notifyChange(guest.id)
    return { ok: true, gifts: await views(guest.id) }
  } catch (err) {
    logger.error({ event: `gift.${op}_error`, err }, 'gift action failed unexpectedly')
    return { ok: false, error: 'invalid' }
  }
}

export async function reserveGiftAction(_prev: GiftActionResult | null, formData: FormData): Promise<GiftActionResult> {
  return run('reserve', formData)
}

export async function releaseGiftAction(_prev: GiftActionResult | null, formData: FormData): Promise<GiftActionResult> {
  return run('release', formData)
}
