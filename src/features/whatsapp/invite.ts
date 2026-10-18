import { findGuestById } from '@/features/guests/repo'
import { inviteUrl } from '@/features/guests/whatsapp'
import { getSettings } from '@/features/settings/repo'
import { logger } from '@/lib/logger'
import { readEvolutionConfig } from './config'
import { createInviteDispatch, markDispatchFailed, markDispatchSent } from './dispatches'
import { sendText, type EvolutionError } from './evolution'
import type { SendInviteError, SendInviteResult } from './invite-result'
import { renderTemplate } from './message'

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

  let delivered = false
  try {
    const settings = await getSettings()
    const text = renderTemplate(settings.whatsappInviteTemplate, {
      name: guest.name,
      link: inviteUrl(guest.token),
    })
    const sent = await deps.sendText(cfg, { phoneE164: guest.phone, text })
    if (!sent.ok) {
      await markDispatchFailed(dispatch.id, sent.error)
      logger.warn(
        { event: 'whatsapp.invite_failed', guestId, adminId, errorCode: sent.error },
        'invite send failed',
      )
      return { ok: false, error: toInviteError(sent.error) }
    }
    delivered = true
    const sentAt = await markDispatchSent(dispatch.id, sent.value.messageId)
    logger.info({ event: 'whatsapp.invite_sent', guestId, adminId, errorCode: null }, 'invite sent')
    return { ok: true, sentAt: sentAt.toISOString() }
  } catch (err) {
    if (delivered) {
      // the provider accepted the message: report it sent even if recording it failed
      logger.error(
        { event: 'whatsapp.invite_sent', guestId, adminId, errorCode: 'record_failed', err },
        'invite sent but not recorded',
      )
      return { ok: true, sentAt: new Date().toISOString() }
    }
    // never leave the row in `sending` (it would block the guest until recovery)
    await markDispatchFailed(dispatch.id, 'internal_error').catch(() => {})
    logger.error(
      { event: 'whatsapp.invite_failed', guestId, adminId, errorCode: 'internal_error', err },
      'invite send crashed',
    )
    return { ok: false, error: 'failed' }
  }
}
