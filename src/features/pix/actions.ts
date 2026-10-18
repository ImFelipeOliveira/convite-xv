'use server'

import { headers } from 'next/headers'
import { isFeatureEnabled } from '@/features/event/flags'
import { findGuestByToken } from '@/features/guests/repo'
import { logger } from '@/lib/logger'
import { getClientIp, rateLimit } from '@/lib/rate-limit'
import type { PixStatus } from '@/server/db/schema'
import { generatePix, getPixStatus, type PixError, type PixView } from './service'

// Public Pix actions for the invite: keyed by the guest token (never guest ids from the client), rate
// limited per IP, answering only the token's own charges. The payer CPF goes straight to the service
// (and from there to Asaas only): never logged, never stored.

export type PixActionError = PixError | 'not_found' | 'invalid'

export type GeneratePixResult = { ok: true; payment: PixView } | { ok: false; error: PixActionError }

export type PixStatusResult =
  | { ok: true; status: PixStatus; paidAt: string | null }
  | { ok: false; error: 'not_found' | 'busy' }

const GENERATE_LIMIT = { max: 10, windowMs: 60_000 }
// the open QR polls every 5 s (12/min): its own, roomier bucket so polling never blocks a new charge
const STATUS_LIMIT = { max: 30, windowMs: 60_000 }
const AMOUNT = /^\d{1,9}$/

function field(formData: FormData, name: string): string {
  const v = formData.get(name)
  return typeof v === 'string' ? v : ''
}

export async function generatePixAction(
  _prev: GeneratePixResult | null,
  formData: FormData,
): Promise<GeneratePixResult> {
  const ip = getClientIp(await headers())
  if (!rateLimit(`pix:${ip}`, GENERATE_LIMIT).ok) {
    logger.warn({ event: 'rate_limit.exceeded', route: 'pix' }, 'rate limit exceeded')
    return { ok: false, error: 'busy' }
  }
  // defense in depth: the section is not rendered with the flag off, but the action stays reachable
  if (!isFeatureEnabled('pix')) {
    logger.warn({ event: 'pix.generate_rejected', reason: 'feature_disabled' }, 'pix action rejected')
    return { ok: false, error: 'not_configured' }
  }
  try {
    const guest = await findGuestByToken(field(formData, 'token'))
    if (!guest) {
      logger.warn({ event: 'pix.generate_rejected', reason: 'not_found' }, 'pix action rejected')
      return { ok: false, error: 'not_found' }
    }
    const amount = field(formData, 'amount')
    if (!AMOUNT.test(amount)) {
      logger.warn({ event: 'pix.generate_rejected', guestId: guest.id, reason: 'invalid' }, 'pix action rejected')
      return { ok: false, error: 'invalid' }
    }
    const result = await generatePix(guest, Number(amount), {}, { cpf: field(formData, 'cpf') || null })
    if (!result.ok) {
      logger.info({ event: 'pix.generate_rejected', guestId: guest.id, reason: result.error }, 'pix action rejected')
      return result
    }
    logger.info({ event: 'pix.generated', guestId: guest.id, paymentId: result.payment.id }, 'pix generated')
    return result
  } catch (err) {
    logger.error({ event: 'pix.generate_error', err }, 'pix action failed unexpectedly')
    return { ok: false, error: 'unavailable' }
  }
}

export async function pixStatusAction(token: string, paymentId: string): Promise<PixStatusResult> {
  const ip = getClientIp(await headers())
  if (!rateLimit(`pix-status:${ip}`, STATUS_LIMIT).ok) {
    logger.warn({ event: 'rate_limit.exceeded', route: 'pix-status' }, 'rate limit exceeded')
    return { ok: false, error: 'busy' }
  }
  if (!isFeatureEnabled('pix') || typeof token !== 'string' || typeof paymentId !== 'string') {
    return { ok: false, error: 'not_found' }
  }
  try {
    const guest = await findGuestByToken(token)
    if (!guest) return { ok: false, error: 'not_found' }
    const view = await getPixStatus(guest.id, paymentId)
    if (!view) return { ok: false, error: 'not_found' }
    return { ok: true, status: view.status, paidAt: view.paidAt }
  } catch (err) {
    logger.error({ event: 'pix.status_error', err }, 'pix status failed unexpectedly')
    // transient: the client keeps polling
    return { ok: false, error: 'busy' }
  }
}
