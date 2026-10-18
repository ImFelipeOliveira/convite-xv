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

function deps(now = NOW) {
  const afterPaid = vi.fn(async () => {})
  return { afterPaid, now: () => now }
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

  it('REFUNDED after paid keeps paid and logs pix.refund_after_paid for the admin', async () => {
    const { row } = await makePayment('paid')
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    expect(await processAsaasWebhook(event('PAYMENT_REFUNDED', { id: row.asaasPaymentId! }), deps(LATER))).toEqual({
      duplicate: false,
      result: 'refund_after_paid',
    })
    expect((await payment(row.id)).status).toBe('paid')
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'pix.refund_after_paid', paymentId: row.id }),
      expect.any(String),
    )
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
    const d = deps()
    expect(
      await processAsaasWebhook(event('PAYMENT_RECEIVED', { id: 'pay_other', externalReference: row.id }), d),
    ).toEqual({ duplicate: false, result: 'paid' })
    expect((await payment(row.id)).status).toBe('paid')
  })

  it('an unknown payment is ignored (logged) and still recorded, so a retry is a duplicate', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    const d = deps()
    const e = event('PAYMENT_RECEIVED', { id: 'pay_nobody', externalReference: 'not-a-uuid' })
    expect(await processAsaasWebhook(e, d)).toEqual({ duplicate: false, result: 'unknown_payment' })
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'pix.webhook_unknown_payment', eventId: e.id, asaasPaymentId: 'pay_nobody' }),
      expect.any(String),
    )
    expect(d.afterPaid).not.toHaveBeenCalled()
    expect(await processAsaasWebhook(e, d)).toEqual({ duplicate: true, result: 'duplicate' })
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
    expect(await processAsaasWebhook(event('PAYMENT_RECEIVED', { id: row.asaasPaymentId! }), { afterPaid, now: () => NOW })).toEqual({
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
