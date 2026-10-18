import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { logger } from '@/lib/logger'
import { db } from '@/server/db/client'
import { pixPayments, webhookEvents, type PixStatus } from '@/server/db/schema'
import { makeGuest } from '../../../../tests/helpers/db'
import { parseAsaasWebhook, processAsaasWebhook, type AsaasWebhookEvent } from '../webhook'

const NOW = new Date('2026-10-18T15:00:00Z')
const LATER = new Date('2026-10-18T16:00:00Z')

async function makePayment(status: PixStatus = 'pending', extra: Partial<typeof pixPayments.$inferInsert> = {}) {
  const guest = await makeGuest()
  const [row] = await db
    .insert(pixPayments)
    .values({
      guestId: guest.id,
      amountCents: 10000,
      asaasPaymentId: `pay_${Math.random().toString(36).slice(2, 10)}`,
      status,
      paidAt: status === 'paid' ? NOW : null,
      createdAt: NOW,
      updatedAt: NOW,
      ...extra,
    })
    .returning()
  return { guest, row }
}

let eventN = 0
function event(
  name: string,
  payment: { id: string; status?: string; externalReference?: string | null },
  id = `evt_${++eventN}&${Date.now()}`,
): AsaasWebhookEvent {
  return {
    id,
    event: name,
    payment: { id: payment.id, status: payment.status ?? 'RECEIVED', externalReference: payment.externalReference ?? null },
  }
}

async function payment(id: string) {
  const [row] = await db.select().from(pixPayments).where(eq(pixPayments.id, id))
  return row
}

const config = { apiKey: 'k', baseUrl: 'http://asaas.test/v3', webhookToken: null }

/** Our payment id for an Asaas id (what Asaas returns as externalReference), or null. */
async function refOf(asaasId: string): Promise<string | null> {
  const [row] = await db.select({ id: pixPayments.id }).from(pixPayments).where(eq(pixPayments.asaasPaymentId, asaasId))
  return row?.id ?? null
}

/**
 * Fake Asaas GET /payments/:id: confirms every payment as RECEIVED for R$ 100,00, with our id as
 * externalReference, unless told otherwise.
 */
function asaasFetch(
  answer: (id: string) => Response | Promise<Response> = async (id) => asaasPayment('RECEIVED', 100, await refOf(id)),
) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const id = decodeURIComponent(String(input).replace(`${config.baseUrl}/payments/`, ''))
    return answer(id)
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>
}

function asaasPayment(status: string, value: number, externalReference: string | null = null, httpStatus = 200) {
  return new Response(JSON.stringify({ object: 'payment', status, value, externalReference }), {
    status: httpStatus,
    headers: { 'content-type': 'application/json' },
  })
}

function deps(now = NOW, fetchImpl = asaasFetch()) {
  const afterPaid = vi.fn(async () => {})
  const afterRefund = vi.fn(async () => {})
  return { afterPaid, afterRefund, now: () => now, config, fetch: fetchImpl }
}

describe('parseAsaasWebhook', () => {
  it('accepts the Asaas payload shape (extra fields ignored)', () => {
    const parsed = parseAsaasWebhook({
      id: 'evt_05b708f961d739ea7eba7e4db318f621&368604920',
      event: 'PAYMENT_RECEIVED',
      dateCreated: '2024-06-12 16:45:03',
      account: { id: 'acc', ownerId: null },
      payment: { object: 'payment', id: 'pay_1', status: 'RECEIVED', externalReference: null, value: 100 },
    })
    expect(parsed).toEqual({
      id: 'evt_05b708f961d739ea7eba7e4db318f621&368604920',
      event: 'PAYMENT_RECEIVED',
      payment: { id: 'pay_1', status: 'RECEIVED', externalReference: null },
    })
  })

  it('accepts a non-payment event without a payment object', () => {
    expect(parseAsaasWebhook({ id: 'evt_x', event: 'TRANSFER_DONE' })).toEqual({
      id: 'evt_x',
      event: 'TRANSFER_DONE',
      payment: null,
    })
  })

  it('rejects payloads without an event id or event name', () => {
    expect(parseAsaasWebhook({ event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1' } })).toBeNull()
    expect(parseAsaasWebhook({ id: '', event: 'PAYMENT_RECEIVED' })).toBeNull()
    expect(parseAsaasWebhook({ id: 'evt_1' })).toBeNull()
    expect(parseAsaasWebhook({ id: 'evt_1', event: 'PAYMENT_RECEIVED', payment: { status: 'RECEIVED' } })).toBeNull()
    expect(parseAsaasWebhook('nope')).toBeNull()
    expect(parseAsaasWebhook(null)).toBeNull()
  })
})

describe('processAsaasWebhook', () => {
  it.each(['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'])('%s → paid with paidAt, after-paid hook called once', async (name) => {
    const { guest, row } = await makePayment()
    const d = deps(LATER)
    const e = event(name, { id: row.asaasPaymentId! })
    expect(await processAsaasWebhook(e, d)).toEqual({ duplicate: false, result: 'paid' })
    const after = await payment(row.id)
    expect(after.status).toBe('paid')
    expect(after.paidAt).toEqual(LATER)
    expect(d.afterPaid).toHaveBeenCalledTimes(1)
    expect(d.afterPaid).toHaveBeenCalledWith(guest.id)
    const [stored] = await db.select().from(webhookEvents).where(eq(webhookEvents.id, e.id))
    expect(stored).toMatchObject({ type: name, paymentId: row.asaasPaymentId, processedAt: LATER })
  })

  it('the same event twice is a duplicate: no reprocessing, no second hook call', async () => {
    const { row } = await makePayment()
    const d = deps()
    const e = event('PAYMENT_RECEIVED', { id: row.asaasPaymentId! })
    await processAsaasWebhook(e, d)
    const first = await payment(row.id)
    expect(await processAsaasWebhook(e, deps(LATER))).toEqual({ duplicate: true, result: 'duplicate' })
    expect(await payment(row.id)).toEqual(first)
    expect(d.afterPaid).toHaveBeenCalledTimes(1)
    expect(await db.select().from(webhookEvents)).toHaveLength(1)
  })

  it('RECEIVED then CONFIRMED (two events) keeps the first paidAt and calls the hook once', async () => {
    const { row } = await makePayment()
    const d = deps()
    await processAsaasWebhook(event('PAYMENT_CONFIRMED', { id: row.asaasPaymentId! }), d)
    const d2 = deps(LATER)
    expect(await processAsaasWebhook(event('PAYMENT_RECEIVED', { id: row.asaasPaymentId! }), d2)).toEqual({
      duplicate: false,
      result: 'unchanged',
    })
    expect((await payment(row.id)).paidAt).toEqual(NOW)
    expect(d.afterPaid).toHaveBeenCalledTimes(1)
    expect(d2.afterPaid).not.toHaveBeenCalled()
  })

  it('OVERDUE after paid stays paid', async () => {
    const { row } = await makePayment('paid')
    const d = deps(LATER)
    expect(await processAsaasWebhook(event('PAYMENT_OVERDUE', { id: row.asaasPaymentId!, status: 'OVERDUE' }), d)).toEqual({
      duplicate: false,
      result: 'unchanged',
    })
    expect(await payment(row.id)).toMatchObject({ status: 'paid', paidAt: NOW })
    expect(d.afterPaid).not.toHaveBeenCalled()
  })

  it('OVERDUE on a pending payment → expired; DELETED → cancelled', async () => {
    const a = await makePayment()
    expect(await processAsaasWebhook(event('PAYMENT_OVERDUE', { id: a.row.asaasPaymentId! }), deps())).toEqual({
      duplicate: false,
      result: 'expired',
    })
    expect((await payment(a.row.id)).status).toBe('expired')
    const b = await makePayment()
    expect(await processAsaasWebhook(event('PAYMENT_DELETED', { id: b.row.asaasPaymentId! }), deps())).toEqual({
      duplicate: false,
      result: 'cancelled',
    })
    expect((await payment(b.row.id)).status).toBe('cancelled')
  })

  it('REFUNDED on a pending payment → cancelled', async () => {
    const { row } = await makePayment()
    await processAsaasWebhook(event('PAYMENT_REFUNDED', { id: row.asaasPaymentId! }), deps())
    expect((await payment(row.id)).status).toBe('cancelled')
  })

  it('REFUNDED after paid (confirmed by Asaas) keeps paid, sets refunded_at and logs pix.refund_after_paid', async () => {
    const { row } = await makePayment('paid')
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    const refunded = asaasFetch(async (id) => asaasPayment('REFUNDED', 100, await refOf(id)))
    expect(await processAsaasWebhook(event('PAYMENT_REFUNDED', { id: row.asaasPaymentId! }), deps(LATER, refunded))).toEqual({
      duplicate: false,
      result: 'refund_after_paid',
    })
    expect(await payment(row.id)).toMatchObject({ status: 'paid', refundedAt: LATER })
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'pix.refund_after_paid', paymentId: row.id }),
      expect.any(String),
    )
    // a later refund event keeps the first refund time (and needs no new confirmation)
    const muchLater = new Date(LATER.getTime() + 60_000)
    const f = asaasFetch()
    await processAsaasWebhook(event('PAYMENT_REFUNDED', { id: row.asaasPaymentId! }), deps(muchLater, f))
    expect((await payment(row.id)).refundedAt).toEqual(LATER)
    expect(f).not.toHaveBeenCalled()
  })

  it('a new refund after paid re-syncs the guest gift messages once, after commit', async () => {
    const { guest, row } = await makePayment('paid')
    vi.spyOn(logger, 'warn').mockImplementation(() => {})
    const refunded = asaasFetch(async (id) => asaasPayment('REFUNDED', 100, await refOf(id)))
    const d = deps(LATER, refunded)
    d.afterRefund.mockImplementation(async () => {
      // runs after commit: the refund is already visible outside the transaction
      expect((await payment(row.id)).refundedAt).toEqual(LATER)
    })
    await processAsaasWebhook(event('PAYMENT_REFUNDED', { id: row.asaasPaymentId! }), d)
    expect(d.afterRefund).toHaveBeenCalledTimes(1)
    expect(d.afterRefund).toHaveBeenCalledWith(guest.id)
    expect(d.afterPaid).not.toHaveBeenCalled()
    // a redundant refund event (already refunded) does not re-sync again
    const d2 = deps(new Date(LATER.getTime() + 60_000), asaasFetch())
    await processAsaasWebhook(event('PAYMENT_REFUNDED', { id: row.asaasPaymentId! }), d2)
    expect(d2.afterRefund).not.toHaveBeenCalled()
  })

  it('a failing refund re-sync is logged by ids only and never fails the webhook', async () => {
    const { guest, row } = await makePayment('paid')
    vi.spyOn(logger, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(logger, 'error').mockImplementation(() => {})
    const refunded = asaasFetch(async (id) => asaasPayment('REFUNDED', 100, await refOf(id)))
    const d = deps(LATER, refunded)
    const boom = new Error('insert into x values (+5595991234567)')
    d.afterRefund.mockRejectedValue(boom)
    expect(await processAsaasWebhook(event('PAYMENT_REFUNDED', { id: row.asaasPaymentId! }), d)).toEqual({
      duplicate: false,
      result: 'refund_after_paid',
    })
    expect(error).toHaveBeenCalledWith(
      { event: 'pix.after_refund_failed', paymentId: row.id, guestId: guest.id, err: boom },
      expect.any(String),
    )
  })

  it('REFUND_REQUESTED at Asaas also confirms a refund after paid', async () => {
    const { row } = await makePayment('paid')
    vi.spyOn(logger, 'warn').mockImplementation(() => {})
    const d = deps(LATER, asaasFetch(async (id) => asaasPayment('REFUND_REQUESTED', 100, await refOf(id))))
    await processAsaasWebhook(event('PAYMENT_REFUNDED', { id: row.asaasPaymentId! }), d)
    expect((await payment(row.id)).refundedAt).toEqual(LATER)
  })

  it.each([
    ['not refunded at Asaas', 'RECEIVED', 'own'],
    ['another externalReference', 'REFUNDED', 'other'],
  ])('a refund after paid that Asaas does not confirm (%s) → ignored, refunded_at unchanged, not recorded', async (_, status, ref) => {
    const { row } = await makePayment('paid')
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    const other = '00000000-0000-4000-8000-000000000000'
    const d = deps(LATER, asaasFetch(() => asaasPayment(status, 100, ref === 'own' ? row.id : other)))
    const e = event('PAYMENT_REFUNDED', { id: row.asaasPaymentId! })
    expect(await processAsaasWebhook(e, d)).toEqual({ duplicate: false, result: 'ignored' })
    expect(await payment(row.id)).toMatchObject({ status: 'paid', refundedAt: null })
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'pix.webhook_unconfirmed', paymentId: row.id, reason: ref === 'own' ? 'status' : 'reference' }),
      expect.any(String),
    )
    expect(await db.select().from(webhookEvents)).toHaveLength(0)
  })

  it('PARTIALLY_REFUNDED only logs pix.partial_refund (no refunded_at, no Asaas call) and is processed', async () => {
    const { row } = await makePayment('paid')
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    const f = asaasFetch()
    const e = event('PAYMENT_PARTIALLY_REFUNDED', { id: row.asaasPaymentId! })
    expect(await processAsaasWebhook(e, deps(LATER, f))).toEqual({ duplicate: false, result: 'partial_refund' })
    expect(await payment(row.id)).toMatchObject({ status: 'paid', refundedAt: null })
    expect(warn).toHaveBeenCalledWith(
      { event: 'pix.partial_refund', eventId: e.id, type: 'PAYMENT_PARTIALLY_REFUNDED', asaasPaymentId: row.asaasPaymentId, paymentId: row.id },
      expect.any(String),
    )
    expect(f).not.toHaveBeenCalled()
    const [stored] = await db.select().from(webhookEvents).where(eq(webhookEvents.id, e.id))
    expect(stored.processedAt).toEqual(LATER)
  })

  it('a payment received after we expired it turns paid (the money arrived)', async () => {
    const { row } = await makePayment('expired')
    const d = deps(LATER)
    expect(await processAsaasWebhook(event('PAYMENT_RECEIVED', { id: row.asaasPaymentId! }), d)).toEqual({
      duplicate: false,
      result: 'paid',
    })
    expect(await payment(row.id)).toMatchObject({ status: 'paid', paidAt: LATER })
    expect(d.afterPaid).toHaveBeenCalledTimes(1)
  })

  it('OVERDUE does not revive a cancelled payment', async () => {
    const { row } = await makePayment('cancelled')
    expect(await processAsaasWebhook(event('PAYMENT_OVERDUE', { id: row.asaasPaymentId! }), deps())).toEqual({
      duplicate: false,
      result: 'unchanged',
    })
    expect((await payment(row.id)).status).toBe('cancelled')
  })

  it('finds the payment by externalReference (our id) when the Asaas id is unknown', async () => {
    const { row } = await makePayment('pending', { asaasPaymentId: null })
    const d = deps(NOW, asaasFetch(() => asaasPayment('RECEIVED', 100, row.id)))
    expect(
      await processAsaasWebhook(event('PAYMENT_RECEIVED', { id: 'pay_other', externalReference: row.id }), d),
    ).toEqual({ duplicate: false, result: 'paid' })
    expect((await payment(row.id)).status).toBe('paid')
  })

  it('an unknown payment is ignored (logged), recorded with processedAt null, and re-examined on a redelivery', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    const d = deps()
    const e = event('PAYMENT_RECEIVED', { id: 'pay_nobody', externalReference: 'not-a-uuid' })
    expect(await processAsaasWebhook(e, d)).toEqual({ duplicate: false, result: 'unknown_payment' })
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'pix.webhook_unknown_payment', eventId: e.id, asaasPaymentId: 'pay_nobody' }),
      expect.any(String),
    )
    expect(d.afterPaid).not.toHaveBeenCalled()
    const [stored] = await db.select().from(webhookEvents).where(eq(webhookEvents.id, e.id))
    expect(stored).toMatchObject({ type: 'PAYMENT_RECEIVED', processedAt: null })
    // never processed: a redelivery is looked at again (still unknown), not answered as a duplicate
    expect(await processAsaasWebhook(e, d)).toEqual({ duplicate: false, result: 'unknown_payment' })
    expect(await db.select().from(webhookEvents)).toHaveLength(1)
  })

  it('the same event delivered twice at once: exactly one processed, one duplicate, one hook call', async () => {
    const { guest, row } = await makePayment()
    const d = deps(LATER)
    const e = event('PAYMENT_RECEIVED', { id: row.asaasPaymentId! })
    const results = await Promise.all([processAsaasWebhook(e, d), processAsaasWebhook(e, d)])
    expect(results.map((r) => r.result).sort()).toEqual(['duplicate', 'paid'])
    expect(results.filter((r) => r.duplicate)).toHaveLength(1)
    expect(d.afterPaid).toHaveBeenCalledTimes(1)
    expect(d.afterPaid).toHaveBeenCalledWith(guest.id)
    expect(await payment(row.id)).toMatchObject({ status: 'paid', paidAt: LATER })
  })

  it('RECEIVED and CONFIRMED arriving at once (row locked): paid once, one hook call', async () => {
    const { row } = await makePayment()
    const d = deps(LATER)
    const results = await Promise.all([
      processAsaasWebhook(event('PAYMENT_RECEIVED', { id: row.asaasPaymentId! }), d),
      processAsaasWebhook(event('PAYMENT_CONFIRMED', { id: row.asaasPaymentId! }), d),
    ])
    expect(results.map((r) => r.result).sort()).toEqual(['paid', 'unchanged'])
    expect(d.afterPaid).toHaveBeenCalledTimes(1)
  })

  it('events we do not act on are recorded and ignored', async () => {
    const { row } = await makePayment()
    expect(await processAsaasWebhook(event('PAYMENT_CREATED', { id: row.asaasPaymentId! }), deps())).toEqual({
      duplicate: false,
      result: 'ignored',
    })
    expect(await processAsaasWebhook({ id: 'evt_t', event: 'TRANSFER_DONE', payment: null }, deps())).toEqual({
      duplicate: false,
      result: 'ignored',
    })
    expect((await payment(row.id)).status).toBe('pending')
    expect(await db.select().from(webhookEvents)).toHaveLength(2)
  })

  it('a failing after-paid hook never fails the webhook', async () => {
    const { row } = await makePayment()
    const error = vi.spyOn(logger, 'error').mockImplementation(() => {})
    const afterPaid = vi.fn(async () => {
      throw new Error('boom')
    })
    expect(await processAsaasWebhook(event('PAYMENT_RECEIVED', { id: row.asaasPaymentId! }), { afterPaid, now: () => NOW, config, fetch: asaasFetch() })).toEqual({
      duplicate: false,
      result: 'paid',
    })
    expect((await payment(row.id)).status).toBe('paid')
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ event: 'pix.after_paid_failed' }), expect.any(String))
  })

  it('logs pix.webhook_received with ids and the result only', async () => {
    const { row } = await makePayment()
    const info = vi.spyOn(logger, 'info').mockImplementation(() => {})
    const e = event('PAYMENT_RECEIVED', { id: row.asaasPaymentId! })
    await processAsaasWebhook(e, deps())
    expect(info).toHaveBeenCalledWith(
      { event: 'pix.webhook_received', eventId: e.id, type: 'PAYMENT_RECEIVED', asaasPaymentId: row.asaasPaymentId, paymentId: row.id, result: 'paid' },
      expect.any(String),
    )
  })
})

describe('processAsaasWebhook: paid events are confirmed with Asaas', () => {
  it('asks Asaas for the payment (by its Asaas id) before marking it paid', async () => {
    const { row } = await makePayment()
    const f = asaasFetch()
    expect(await processAsaasWebhook(event('PAYMENT_RECEIVED', { id: row.asaasPaymentId! }), deps(LATER, f))).toEqual({
      duplicate: false,
      result: 'paid',
    })
    expect(f).toHaveBeenCalledTimes(1)
    expect(String(f.mock.calls[0][0])).toBe(`${config.baseUrl}/payments/${row.asaasPaymentId}`)
  })

  it('not paid at Asaas → ignored (200), stays pending, logged as pix.webhook_unconfirmed, nothing recorded', async () => {
    const { row } = await makePayment()
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    const d = deps(LATER, asaasFetch(() => asaasPayment('PENDING', 100)))
    const e = event('PAYMENT_RECEIVED', { id: row.asaasPaymentId! })
    expect(await processAsaasWebhook(e, d)).toEqual({ duplicate: false, result: 'ignored' })
    expect((await payment(row.id)).status).toBe('pending')
    expect(d.afterPaid).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'pix.webhook_unconfirmed', eventId: e.id, paymentId: row.id, reason: 'status' }),
      expect.any(String),
    )
    // not recorded: a later redelivery (once Asaas confirms) is processed
    expect(await db.select().from(webhookEvents)).toHaveLength(0)
    expect(await processAsaasWebhook(e, deps(LATER))).toEqual({ duplicate: false, result: 'paid' })
  })

  it('another externalReference at Asaas → ignored, stays pending', async () => {
    const { row } = await makePayment()
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    const d = deps(LATER, asaasFetch(() => asaasPayment('RECEIVED', 100, '00000000-0000-4000-8000-000000000000')))
    expect(await processAsaasWebhook(event('PAYMENT_RECEIVED', { id: row.asaasPaymentId! }), d)).toEqual({
      duplicate: false,
      result: 'ignored',
    })
    expect((await payment(row.id)).status).toBe('pending')
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'pix.webhook_unconfirmed', reason: 'reference' }),
      expect.any(String),
    )
  })

  it('a different value at Asaas → ignored, stays pending', async () => {
    const { row } = await makePayment()
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    const d = deps(LATER, asaasFetch(() => asaasPayment('RECEIVED', 70)))
    expect(await processAsaasWebhook(event('PAYMENT_CONFIRMED', { id: row.asaasPaymentId! }), d)).toEqual({
      duplicate: false,
      result: 'ignored',
    })
    expect((await payment(row.id)).status).toBe('pending')
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'pix.webhook_unconfirmed', reason: 'value' }),
      expect.any(String),
    )
  })

  it('Asaas unreachable → throws (the route answers 500 so Asaas retries); nothing changed or recorded', async () => {
    const { row } = await makePayment()
    const d = deps(LATER, asaasFetch(() => asaasPayment('x', 0, null, 500)))
    await expect(processAsaasWebhook(event('PAYMENT_RECEIVED', { id: row.asaasPaymentId! }), d)).rejects.toThrow()
    expect((await payment(row.id)).status).toBe('pending')
    expect(await db.select().from(webhookEvents)).toHaveLength(0)
  })

  it('Asaas not configured → throws (cannot confirm)', async () => {
    const { row } = await makePayment()
    const d = { ...deps(LATER), config: null }
    await expect(processAsaasWebhook(event('PAYMENT_RECEIVED', { id: row.asaasPaymentId! }), d)).rejects.toThrow()
    expect((await payment(row.id)).status).toBe('pending')
  })

  it('does not ask Asaas when there is nothing to confirm (already paid, unknown payment, a redelivery)', async () => {
    const { row } = await makePayment('paid')
    const f = asaasFetch()
    const e = event('PAYMENT_RECEIVED', { id: row.asaasPaymentId! })
    expect(await processAsaasWebhook(e, deps(LATER, f))).toEqual({ duplicate: false, result: 'unchanged' })
    expect(await processAsaasWebhook(e, deps(LATER, f))).toEqual({ duplicate: true, result: 'duplicate' })
    expect(
      await processAsaasWebhook(event('PAYMENT_RECEIVED', { id: 'pay_nobody' }), deps(LATER, f)),
    ).toEqual({ duplicate: false, result: 'unknown_payment' })
    expect(f).not.toHaveBeenCalled()
  })

  it('non-paid events are applied without asking Asaas', async () => {
    const { row } = await makePayment()
    const f = asaasFetch()
    await processAsaasWebhook(event('PAYMENT_OVERDUE', { id: row.asaasPaymentId! }), deps(LATER, f))
    expect((await payment(row.id)).status).toBe('expired')
    expect(f).not.toHaveBeenCalled()
  })
})
