'use server'

import { headers } from 'next/headers'
import { getClientIp, rateLimit } from '@/lib/rate-limit'
import { submitRsvp, type RsvpResult } from './service'

function field(formData: FormData, name: string): string | undefined {
  const v = formData.get(name)
  return typeof v === 'string' ? v : undefined
}

export async function submitRsvpAction(
  _prev: RsvpResult | null,
  formData: FormData,
): Promise<RsvpResult> {
  const token = field(formData, 'token') ?? ''
  const ip = getClientIp(await headers())
  if (!rateLimit(`rsvp:${ip}:${token}`, { max: 10, windowMs: 60_000 }).ok) {
    return { ok: false, error: 'invalid' }
  }
  const plusOnesRaw = field(formData, 'plusOnes')
  return submitRsvp({
    token,
    status: field(formData, 'status'),
    plusOnes: plusOnesRaw === undefined || plusOnesRaw === '' ? undefined : Number(plusOnesRaw),
    message: field(formData, 'message'),
    phone: field(formData, 'phone'),
  })
}
