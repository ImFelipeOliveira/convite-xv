import { findGuestById } from '@/features/guests/repo'
import { inviteUrl } from '@/features/guests/whatsapp'
import { getSettings } from '@/features/settings/repo'
import { logger } from '@/lib/logger'
import { readEvolutionConfig } from './config'
import { createInviteDispatch, dbNow, markDispatchFailed, markDispatchSent } from './dispatches'
import { sendText, type EvolutionError } from './evolution'
import type { SendInviteError, SendInviteResult } from './invite-result'
import { renderTemplate } from './message'
import { scheduleRsvpNudges } from './reminders'

export { inviteErrorMessage, type SendInviteError, type SendInviteResult } from './invite-result'

export type SendInviteDeps = {
  sendText: typeof sendText
  readEvolutionConfig: typeof readEvolutionConfig
}

const defaultDeps: SendInviteDeps = { sendText, readEvolutionConfig }

function toInviteError(e: EvolutionError): SendInviteError {
  if (e === 'not_connected' || e === 'invalid_number' || e === 'not_configured') return e
  return 'failed'
}

/**
 * Sends one invite now (synchronous, one click = one send). Order: config → guest → phone →
 * dispatch row (blocked while one is in flight or was sent in the last 60 s) → render → send → record.
 */
export async function sendInvite(
  guestId: string,
  adminId: string,
  deps: SendInviteDeps = defaultDeps,
): Promise<SendInviteResult> {
  const cfg = deps.readEvolutionConfig()
  if (!cfg) return { ok: false, error: 'not_configured' }

  const guest = await findGuestById(guestId)
  if (!guest) return { ok: false, error: 'not_found' }
  if (!guest.phone) return { ok: false, error: 'no_phone' }

  const dispatch = await createInviteDispatch(guest.id, adminId)
  if ('blocked' in dispatch) return { ok: false, error: 'blocked' }

  let sent: Awaited<ReturnType<SendInviteDeps['sendText']>>
  let rsvpDeadline: string
  try {
    const settings = await getSettings()
    rsvpDeadline = settings.rsvpDeadline
    const text = renderTemplate(settings.whatsappInviteTemplate, {
      name: guest.name,
      link: inviteUrl(guest.token),
    })
    sent = await deps.sendText(cfg, { phoneE164: guest.phone, text })
  } catch (err) {
    // never leave the row in `sending` (it would block the guest until recovery)
    await markDispatchFailed(dispatch.id, 'internal_error').catch(() => {})
    logger.error(
      { event: 'whatsapp.invite_failed', guestId, adminId, errorCode: 'internal_error', err },
      'invite send crashed',
    )
    return { ok: false, error: 'failed' }
  }

  if (!sent.ok) {
    logger.warn({ event: 'whatsapp.invite_failed', guestId, adminId, errorCode: sent.error }, 'invite send failed')
    try {
      await markDispatchFailed(dispatch.id, sent.error)
    } catch (err) {
      // the answer to the admin doesn't depend on the bookkeeping; recovery fails the row later
      logger.error(
        { event: 'whatsapp.invite_record_failed', guestId, adminId, errorCode: sent.error, err },
        'invite failure not recorded',
      )
    }
    return { ok: false, error: toInviteError(sent.error) }
  }

  // the provider accepted the message: from here on the result is a success
  const sentAt = await recordSent(dispatch.id, sent.value.messageId, { guestId, adminId })
  logger.info({ event: 'whatsapp.invite_sent', guestId, adminId, errorCode: null }, 'invite sent')
  try {
    await scheduleRsvpNudges(guest, sentAt, rsvpDeadline)
  } catch (err) {
    logger.error({ event: 'whatsapp.reminder_sync_failed', guestId, adminId, err }, 'rsvp nudge scheduling failed')
  }
  return { ok: true, sentAt: sentAt.toISOString() }
}

/** markDispatchSent with one retry; falls back to the DB clock (process clock only if the DB is gone). */
async function recordSent(
  dispatchId: string,
  messageId: string | null,
  ids: { guestId: string; adminId: string },
): Promise<Date> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await markDispatchSent(dispatchId, messageId)
    } catch (err) {
      logger.error(
        { event: 'whatsapp.invite_record_failed', ...ids, errorCode: 'record_failed', attempt, err },
        'invite sent but not recorded',
      )
    }
  }
  try {
    return await dbNow()
  } catch {
    return new Date()
  }
}
