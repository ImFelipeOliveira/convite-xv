'use server'

import { headers } from 'next/headers'
import { logger } from '@/lib/logger'
import { getClientIp, rateLimit } from '@/lib/rate-limit'
import { submitRsvp, type RsvpResult } from './service'
import { toRsvpGuestView, type RsvpGuestView } from './view'

function field(formData: FormData, name: string): string | undefined {
  const v = formData.get(name)
  return typeof v === 'string' ? v : undefined
}

/** The action's answer goes to the browser, so the saved guest is reduced to the RSVP view (no phone, no ids). */
export type RsvpActionResult =
  | { ok: true; guest: RsvpGuestView }
  | Extract<RsvpResult, { ok: false }>

export async function submitRsvpAction(
  _prev: RsvpActionResult | null,
  formData: FormData,
): Promise<RsvpActionResult> {
  const token = field(formData, 'token') ?? ''
  const ip = getClientIp(await headers())
  if (!rateLimit(`rsvp:${ip}`, { max: 20, windowMs: 60_000 }).ok) {
    logger.warn({ event: 'rate_limit.exceeded', route: 'rsvp' }, 'rate limit exceeded')
    return { ok: false, error: 'invalid' }
  }
  const plusOnesRaw = field(formData, 'plusOnes')
  try {
    const result = await submitRsvp({
      token,
      status: field(formData, 'status'),
      plusOnes: plusOnesRaw === undefined || plusOnesRaw === '' ? undefined : Number(plusOnesRaw),
      message: field(formData, 'message'),
      phone: field(formData, 'phone'),
    })
    if (!result.ok) {
      logger.warn({ event: 'rsvp.rejected', reason: result.error }, 'rsvp rejected')
      return result
    }
    logger.info(
      {
        event: 'rsvp.submitted',
        guestId: result.guest.id,
        status: result.guest.rsvpStatus,
        plusOnes: result.guest.plusOnes,
        phoneAdded: result.phoneAdded,
      },
      'rsvp submitted',
    )
    return { ok: true, guest: toRsvpGuestView(result.guest) }
  } catch (err) {
    logger.error({ event: 'rsvp.error', err }, 'rsvp failed unexpectedly')
    return { ok: false, error: 'invalid' }
  }
}
