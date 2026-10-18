'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdmin } from '@/features/admin-auth/guard'
import { logger } from '@/lib/logger'
import { disconnect, pollStatus, startConnect } from './connection'
import type { ConnectResult, DisconnectResult, RetryDispatchResult, StatusResult } from './connection-result'
import { retryFailedReminder } from './dispatches'
import { sendInvite } from './invite'
import type { SendInviteResult } from './invite-result'

const idSchema = z.uuid()

/** Sends one invite from the guests list (form field `guestId`). */
export async function sendInviteAction(
  _prev: SendInviteResult | null,
  formData: FormData,
): Promise<SendInviteResult> {
  const { adminId } = await requireAdmin()
  const parsed = idSchema.safeParse(formData.get('guestId'))
  if (!parsed.success) return { ok: false, error: 'not_found' }
  const result = await sendInvite(parsed.data, adminId)
  revalidatePath('/admin/guests')
  return result
}

/** "Conectar número": creates the Evolution instance if needed and returns the QR to scan. */
export async function connectWhatsappAction(): Promise<ConnectResult> {
  const { adminId } = await requireAdmin()
  logger.info({ event: 'admin.whatsapp_connect_requested', adminId }, 'whatsapp connect requested')
  const result = await startConnect()
  if (!result.ok) {
    logger.warn({ event: 'admin.whatsapp_connect_failed', adminId, errorCode: result.error }, 'whatsapp connect failed')
  }
  return result
}

/** Polled by the status card (every 3 s while a QR is up); `refreshQr` also returns the current QR. */
export async function whatsappStatusAction(refreshQr: boolean): Promise<StatusResult> {
  await requireAdmin()
  return pollStatus(refreshQr === true)
}

export async function logoutWhatsappAction(): Promise<DisconnectResult> {
  const { adminId } = await requireAdmin()
  const result = await disconnect()
  logger.info(
    { event: 'admin.whatsapp_logout', adminId, errorCode: result.ok ? null : result.error },
    'whatsapp logout',
  )
  return result
}

/** "Tentar de novo" on a failed reminder: back to `scheduled` now with a fresh retry budget. */
export async function retryDispatchAction(dispatchId: string): Promise<RetryDispatchResult> {
  const { adminId } = await requireAdmin()
  const parsed = idSchema.safeParse(dispatchId)
  if (!parsed.success) return { ok: false, error: 'not_retryable' }
  const changed = await retryFailedReminder(parsed.data)
  logger.info(
    { event: 'admin.dispatch_retry', adminId, dispatchId: parsed.data, errorCode: changed ? null : 'not_retryable' },
    'dispatch retry',
  )
  revalidatePath('/admin/whatsapp')
  return changed ? { ok: true } : { ok: false, error: 'not_retryable' }
}
