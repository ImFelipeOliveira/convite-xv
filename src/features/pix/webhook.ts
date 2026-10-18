import { z } from 'zod'
import { logger } from '@/lib/logger'
import { db } from '@/server/db/client'
import { afterPixPaid } from './after-paid'
import { getPayment } from './asaas'
import { readAsaasConfig, type AsaasConfig } from './config'
import {
  findPaymentForWebhook,
  insertWebhookEvent,
  isWebhookEventProcessed,
  markPaymentPaid,
  markPaymentRefunded,
  markWebhookEventProcessed,
  settlePendingPayment,
} from './repo'

// Asaas webhook processing (POST /api/webhooks/asaas). Asaas delivers at least once, so every event is
// recorded by its id (webhook_events pk) in the same transaction that applies it: a redelivery is a
// no-op, and a failure rolls both back so Asaas' retry processes it again. Defense in depth: a paid
// event is only applied after Asaas itself confirms the payment as paid for our amount (GET
// /payments/:id), so a leaked webhook token alone cannot mark a Pix paid.
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
const PARTIAL_REFUND = 'PAYMENT_PARTIALLY_REFUNDED'
/** Asaas statuses that confirm a full refund of a paid charge. */
const REFUND_STATUSES = new Set(['REFUNDED', 'REFUND_REQUESTED'])

export type WebhookResult =
  | 'paid'
  | 'expired'
  | 'cancelled'
  /** already in a final state this event may not change (paid is never downgraded) */
  | 'unchanged'
  /** a refund of a paid Pix: stays paid, refunded_at set, logged for the admin */
  | 'refund_after_paid'
  /** a partial refund: nothing changes, logged only */
  | 'partial_refund'
  | 'unknown_payment'
  /** an event we do not act on */
  | 'ignored'
  | 'duplicate'

export type WebhookDeps = {
  now?: () => Date
  afterPaid?: (guestId: string) => Promise<void>
  /** undefined = read from env; null = not configured (paid events cannot be confirmed) */
  config?: AsaasConfig | null
  fetch?: typeof fetch
}

/** Asaas must answer the confirmation quickly: the webhook call itself is waiting. */
const CONFIRM_TIMEOUT_MS = 8_000

/** Asaas could not confirm a paid event (unreachable, not configured, …): the caller answers 500, Asaas retries. */
export class WebhookConfirmError extends Error {
  constructor(readonly code: string) {
    super(`asaas confirmation failed: ${code}`)
    this.name = 'WebhookConfirmError'
  }
}

type Applied = { result: WebhookResult; paymentId: string | null; guestId: string | null }

/**
 * Applies one Asaas event. Paid is never downgraded: OVERDUE/DELETED after paid are ignored, and a refund
 * after paid (confirmed with Asaas: REFUNDED/REFUND_REQUESTED, our externalReference) keeps `paid`, records
 * `refunded_at` (the admin page shows "Estornado" and leaves it out of the received total) and logs
 * `pix.refund_after_paid`; a partial refund only logs `pix.partial_refund`. A payment received after we expired/cancelled it turns
 * `paid` (the money arrived). A paid event is confirmed with Asaas first (status paid, value equal to our
 * amount, externalReference our id; otherwise `ignored`, logged `pix.webhook_unconfirmed`, not recorded so a redelivery is looked
 * at again). On a new `paid`, the after-paid hook runs once, after commit, best effort. An unknown
 * payment's event stays unprocessed (`processed_at` null). Throws on infrastructure failures and when
 * Asaas cannot confirm (the caller answers 500 so Asaas retries).
 */
export async function processAsaasWebhook(
  evt: AsaasWebhookEvent,
  deps: WebhookDeps = {},
): Promise<{ duplicate: boolean; result: WebhookResult }> {
  const now = (deps.now ?? (() => new Date()))()
  const afterPaid = deps.afterPaid ?? afterPixPaid
  const asaasPaymentId = evt.payment?.id ?? null
  const target = evt.payment ? TARGET[evt.event] : undefined
  const received = (result: WebhookResult, paymentId: string | null) =>
    logger.info(
      { event: 'pix.webhook_received', eventId: evt.id, type: evt.event, asaasPaymentId, paymentId, result },
      'pix webhook received',
    )

  // Confirm a paid event, or a full refund of a paid charge, with Asaas BEFORE the transaction (never hold
  // a connection while Asaas answers). Asaas must report the status, our value (paid) and our id as
  // externalReference.
  let confirmedId: string | null = null
  const check = target === 'paid' ? 'paid' : evt.event === 'PAYMENT_REFUNDED' ? 'refund' : null
  if (check && evt.payment) {
    if (await isWebhookEventProcessed(evt.id)) {
      received('duplicate', null)
      return { duplicate: true, result: 'duplicate' }
    }
    const row = await findPaymentForWebhook(evt.payment.id, evt.payment.externalReference)
    const changes = row && (check === 'paid' ? row.status !== 'paid' : row.status === 'paid' && !row.refundedAt)
    if (row && changes) {
      const config = deps.config === undefined ? readAsaasConfig() : deps.config
      const remote = await getPayment(config, evt.payment.id, deps.fetch ?? fetch, { timeoutMs: CONFIRM_TIMEOUT_MS })
      if (!remote.ok) throw new WebhookConfirmError(remote.error)
      const r = remote.value
      const reason =
        check === 'paid'
          ? r.status !== 'paid'
            ? 'status'
            : r.valueCents !== row.amountCents
              ? 'value'
              : r.externalReference !== row.id
                ? 'reference'
                : null
          : !REFUND_STATUSES.has(r.asaasStatus)
            ? 'status'
            : r.externalReference !== row.id
              ? 'reference'
              : null
      if (reason) {
        logger.warn(
          { event: 'pix.webhook_unconfirmed', eventId: evt.id, type: evt.event, asaasPaymentId, paymentId: row.id, reason },
          'pix webhook not confirmed by asaas: ignored',
        )
        received('ignored', row.id)
        return { duplicate: false, result: 'ignored' }
      }
      confirmedId = row.id
    }
  }

  const outcome = await db.transaction(async (tx): Promise<Applied> => {
    const fresh = await insertWebhookEvent({ id: evt.id, type: evt.event, paymentId: asaasPaymentId, now }, tx)
    if (!fresh) return { result: 'duplicate', paymentId: null, guestId: null }

    const apply = async (): Promise<Applied> => {
      if (!target || !evt.payment) return { result: 'ignored', paymentId: null, guestId: null }
      // row lock: concurrent events for this payment (RECEIVED + CONFIRMED, webhook + poll) apply in turn
      const row = await findPaymentForWebhook(evt.payment.id, evt.payment.externalReference, tx, { lock: true })
      if (!row) return { result: 'unknown_payment', paymentId: null, guestId: null }
      const ids = { paymentId: row.id, guestId: row.guestId }
      if (target === 'paid') {
        if (row.status === 'paid') return { result: 'unchanged', ...ids }
        // appeared (or turned unpaid) after the confirmation step: never paid unconfirmed, Asaas retries
        if (row.id !== confirmedId) throw new WebhookConfirmError('changed_during_confirmation')
        const paid = await markPaymentPaid(row.id, now, tx)
        return { result: paid ? 'paid' : 'unchanged', ...ids }
      }
      // a partial refund changes nothing (the guest still gave most of it): logged only
      if (evt.event === PARTIAL_REFUND) return { result: 'partial_refund', ...ids }
      if (row.status === 'paid' && evt.event === 'PAYMENT_REFUNDED') {
        if (!row.refundedAt) {
          if (row.id !== confirmedId) throw new WebhookConfirmError('changed_during_confirmation')
          // stays paid; the admin sees "Estornado" (refunded_at)
          await markPaymentRefunded(row.id, now, tx)
        }
        return { result: 'refund_after_paid', ...ids }
      }
      // only a still-pending charge expires or is cancelled (never overwrites paid or another final status)
      const settled = await settlePendingPayment(row.id, target, now, tx)
      return { result: settled ? target : 'unchanged', ...ids }
    }

    const applied = await apply()
    // an unknown payment's event stays unprocessed: a redelivery is examined again
    if (applied.result !== 'unknown_payment') await markWebhookEventProcessed(evt.id, now, tx)
    return applied
  })

  const { result, paymentId, guestId } = outcome
  if (result === 'unknown_payment') {
    logger.warn(
      { event: 'pix.webhook_unknown_payment', eventId: evt.id, type: evt.event, asaasPaymentId },
      'pix webhook for an unknown payment',
    )
  }
  if (result === 'partial_refund') {
    logger.warn(
      { event: 'pix.partial_refund', eventId: evt.id, type: evt.event, asaasPaymentId, paymentId },
      'pix partially refunded: nothing changed',
    )
  }
  if (result === 'refund_after_paid') {
    logger.warn(
      { event: 'pix.refund_after_paid', eventId: evt.id, type: evt.event, asaasPaymentId, paymentId },
      'pix refunded after paid: kept as paid',
    )
  }
  received(result, paymentId)

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
