import { z } from 'zod'
import { logger } from '@/lib/logger'
import { db } from '@/server/db/client'
import { afterPixPaid } from './after-paid'
import {
  findPaymentForWebhook,
  insertWebhookEvent,
  markPaymentPaid,
  markWebhookEventProcessed,
  settlePendingPayment,
} from './repo'

// Asaas webhook processing (POST /api/webhooks/asaas). Asaas delivers at least once, so every event is
// recorded by its id (webhook_events pk) in the same transaction that applies it: a redelivery is a
// no-op, and a failure rolls both back so Asaas' retry processes it again.
//
// Payload (docs.asaas.com/docs/payment-events, checked 2026-10-18):
//   { id: "evt_…&…", event: "PAYMENT_RECEIVED", dateCreated, account: {…},
//     payment: { object: "payment", id: "pay_…", status: "RECEIVED", externalReference, value, … } }

const MAX_TEXT = 200

const payloadSchema = z.object({
  id: z.string().min(1).max(MAX_TEXT),
  event: z.string().min(1).max(MAX_TEXT),
  payment: z
    .object({
      id: z.string().min(1).max(MAX_TEXT),
      status: z.string().max(MAX_TEXT).nullish(),
      externalReference: z.string().max(MAX_TEXT).nullish(),
    })
    .nullish(),
})

export type AsaasWebhookEvent = {
  id: string
  event: string
  payment: { id: string; status: string | null; externalReference: string | null } | null
}

/** Validated event, or null for anything that is not an Asaas webhook payload. */
export function parseAsaasWebhook(body: unknown): AsaasWebhookEvent | null {
  const parsed = payloadSchema.safeParse(body)
  if (!parsed.success) return null
  const { id, event, payment } = parsed.data
  return {
    id,
    event,
    payment: payment
      ? { id: payment.id, status: payment.status ?? null, externalReference: payment.externalReference ?? null }
      : null,
  }
}

const TARGET: Record<string, 'paid' | 'expired' | 'cancelled'> = {
  PAYMENT_RECEIVED: 'paid',
  PAYMENT_CONFIRMED: 'paid',
  PAYMENT_OVERDUE: 'expired',
  PAYMENT_DELETED: 'cancelled',
  PAYMENT_REFUNDED: 'cancelled',
  PAYMENT_PARTIALLY_REFUNDED: 'cancelled',
}
const REFUNDS = new Set(['PAYMENT_REFUNDED', 'PAYMENT_PARTIALLY_REFUNDED'])

export type WebhookResult =
  | 'paid'
  | 'expired'
  | 'cancelled'
  /** already in a final state this event may not change (paid is never downgraded) */
  | 'unchanged'
  /** a refund of a paid Pix: stays paid, logged for the admin */
  | 'refund_after_paid'
  | 'unknown_payment'
  /** an event we do not act on */
  | 'ignored'
  | 'duplicate'

export type WebhookDeps = {
  now?: () => Date
  afterPaid?: (guestId: string) => Promise<void>
}

/**
 * Applies one Asaas event. Paid is never downgraded: OVERDUE/DELETED after paid are ignored, and a refund
 * after paid keeps `paid` but logs `pix.refund_after_paid` (decision: the guest did send the gift, the
 * admin sees the refund in Asaas and in the logs). A payment received after we expired/cancelled it turns
 * `paid` (the money arrived). On a new `paid`, the after-paid hook runs once, after commit, best effort.
 * Throws only on infrastructure failures (the caller answers 500 so Asaas retries).
 */
export async function processAsaasWebhook(
  evt: AsaasWebhookEvent,
  deps: WebhookDeps = {},
): Promise<{ duplicate: boolean; result: WebhookResult }> {
  const now = (deps.now ?? (() => new Date()))()
  const afterPaid = deps.afterPaid ?? afterPixPaid
  const asaasPaymentId = evt.payment?.id ?? null

  const outcome = await db.transaction(async (tx) => {
    const fresh = await insertWebhookEvent({ id: evt.id, type: evt.event, paymentId: asaasPaymentId, now }, tx)
    if (!fresh) return { result: 'duplicate' as const, paymentId: null, guestId: null }

    const apply = async (): Promise<{ result: WebhookResult; paymentId: string | null; guestId: string | null }> => {
      const target = TARGET[evt.event]
      if (!target || !evt.payment) return { result: 'ignored', paymentId: null, guestId: null }
      const row = await findPaymentForWebhook(evt.payment.id, evt.payment.externalReference, tx)
      if (!row) return { result: 'unknown_payment', paymentId: null, guestId: null }
      const ids = { paymentId: row.id, guestId: row.guestId }
      if (target === 'paid') {
        const paid = await markPaymentPaid(row.id, now, tx)
        return { result: paid ? 'paid' : 'unchanged', ...ids }
      }
      if (row.status === 'paid' && REFUNDS.has(evt.event)) return { result: 'refund_after_paid', ...ids }
      // only a still-pending charge expires or is cancelled (never overwrites paid or another final status)
      const settled = await settlePendingPayment(row.id, target, now, tx)
      return { result: settled ? target : 'unchanged', ...ids }
    }

    const applied = await apply()
    await markWebhookEventProcessed(evt.id, now, tx)
    return applied
  })

  const { result, paymentId, guestId } = outcome
  if (result === 'unknown_payment') {
    logger.warn(
      { event: 'pix.webhook_unknown_payment', eventId: evt.id, type: evt.event, asaasPaymentId },
      'pix webhook for an unknown payment',
    )
  }
  if (result === 'refund_after_paid') {
    logger.warn(
      { event: 'pix.refund_after_paid', eventId: evt.id, type: evt.event, asaasPaymentId, paymentId },
      'pix refunded after paid: kept as paid',
    )
  }
  logger.info(
    { event: 'pix.webhook_received', eventId: evt.id, type: evt.event, asaasPaymentId, paymentId, result },
    'pix webhook received',
  )

  if (result === 'paid' && guestId) {
    try {
      await afterPaid(guestId)
    } catch (err) {
      logger.error({ event: 'pix.after_paid_failed', paymentId, guestId, err }, 'pix after-paid hook failed')
    }
  }
  return { duplicate: result === 'duplicate', result }
}

let notConfiguredLogged = false

/** Logs a missing ASAAS_WEBHOOK_TOKEN once per process (every request still answers 503). */
export function warnWebhookNotConfigured(): void {
  if (notConfiguredLogged) return
  notConfiguredLogged = true
  logger.error({ event: 'pix.webhook_not_configured' }, 'ASAAS_WEBHOOK_TOKEN is not set: webhook disabled')
}

/** Test helper: forgets that the missing-token error was logged. */
export function resetWebhookConfigWarning(): void {
  notConfiguredLogged = false
}
