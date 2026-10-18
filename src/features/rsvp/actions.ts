'use server'

import { headers } from 'next/headers'
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
  if (!rateLimit(`rsvp:${ip}:${token}`, { max: 10, windowMs: 60_000 }).ok) {
    return { ok: false, error: 'invalid' }
  }
  const plusOnesRaw = field(formData, 'plusOnes')
  const result = await submitRsvp({
    token,
    status: field(formData, 'status'),
    plusOnes: plusOnesRaw === undefined || plusOnesRaw === '' ? undefined : Number(plusOnesRaw),
    message: field(formData, 'message'),
    phone: field(formData, 'phone'),
  })
  return result.ok ? { ok: true, guest: toRsvpGuestView(result.guest) } : result
}
