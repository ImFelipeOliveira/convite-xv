import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { logger } from '@/lib/logger'
import { resetRateLimits } from '@/lib/rate-limit'
import { db } from '@/server/db/client'
import { pixPayments } from '@/server/db/schema'
import { makeGuest } from '../../../tests/helpers/db'

const afterPixPaid = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('@/features/pix/after-paid', () => ({ afterPixPaid }))

const { POST } = await import('../api/webhooks/asaas/route')
const { resetWebhookConfigWarning } = await import('@/features/pix/webhook')

const TOKEN = 'route-test-webhook-token'

function request(body: string, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/webhooks/asaas', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'asaas-access-token': TOKEN, ...headers },
    body,
  })
}

async function pendingPayment() {
  const guest = await makeGuest()
  const [row] = await db
    .insert(pixPayments)
    .values({ guestId: guest.id, amountCents: 10000, asaasPaymentId: 'pay_route_1', status: 'pending' })
    .returning()
  return { guest, row }
}

const received = (eventId = 'evt_route_1') =>
  JSON.stringify({
    id: eventId,
    event: 'PAYMENT_RECEIVED',
    dateCreated: '2026-10-18 12:00:00',
    payment: { object: 'payment', id: 'pay_route_1', status: 'RECEIVED', externalReference: null },
  })

async function status(id: string) {
  const [row] = await db.select().from(pixPayments).where(eq(pixPayments.id, id))
  return row.status
}

// the webhook confirms paid events with Asaas (GET /payments/:id): a stubbed Asaas answers RECEIVED, R$ 100
const asaasGet = vi.fn(
  async () =>
    new Response(JSON.stringify({ object: 'payment', status: 'RECEIVED', value: 100 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
)

beforeEach(() => {
  vi.stubEnv('ASAAS_WEBHOOK_TOKEN', TOKEN)
  vi.stubEnv('ASAAS_API_KEY', 'route-test-key')
  vi.stubEnv('ASAAS_BASE_URL', 'http://asaas.test/v3')
  vi.stubGlobal('fetch', asaasGet)
  asaasGet.mockClear()
  afterPixPaid.mockClear()
  resetWebhookConfigWarning()
  resetRateLimits()
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const rejectedLogs = (warn: { mock: { calls: unknown[][] } }) =>
  warn.mock.calls.filter(([o]) => (o as { event?: string }).event === 'pix.webhook_rejected')

describe('POST /api/webhooks/asaas', () => {
  it('401 for a wrong or missing token (no processing)', async () => {
    const { row } = await pendingPayment()
    expect((await POST(request(received(), { 'asaas-access-token': 'wrong' }))).status).toBe(401)
    expect((await POST(request(received(), { 'asaas-access-token': `${TOKEN}x` }))).status).toBe(401)
    const noHeader = new Request('http://localhost/api/webhooks/asaas', { method: 'POST', body: received() })
    expect((await POST(noHeader)).status).toBe(401)
    expect(await status(row.id)).toBe('pending')
  })

  it('503 (logged once) when ASAAS_WEBHOOK_TOKEN is not configured', async () => {
    vi.stubEnv('ASAAS_WEBHOOK_TOKEN', '')
    const error = vi.spyOn(logger, 'error').mockImplementation(() => {})
    expect((await POST(request(received()))).status).toBe(503)
    expect((await POST(request(received()))).status).toBe(503)
    expect(error.mock.calls.filter(([o]) => (o as { event?: string }).event === 'pix.webhook_not_configured')).toHaveLength(1)
  })

  it('400 for malformed JSON or an invalid payload', async () => {
    expect((await POST(request('{not json'))).status).toBe(400)
    expect((await POST(request(JSON.stringify({ event: 'PAYMENT_RECEIVED' })))).status).toBe(400)
  })

  it('413 for a body over 64 KB', async () => {
    const big = JSON.stringify({ id: 'evt_big', event: 'PAYMENT_RECEIVED', pad: 'x'.repeat(70_000) })
    expect((await POST(request(big))).status).toBe(413)
    // a lying content-length is caught too
    expect((await POST(request(big, { 'content-length': '10' }))).status).toBe(413)
  })

  it('PAYMENT_RECEIVED → paid and the after-paid hook called once; a redelivery is a duplicate', async () => {
    const { guest, row } = await pendingPayment()
    const res = await POST(request(received()))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(await status(row.id)).toBe('paid')
    expect(afterPixPaid).toHaveBeenCalledTimes(1)
    expect(afterPixPaid).toHaveBeenCalledWith(guest.id)

    const again = await POST(request(received()))
    expect(again.status).toBe(200)
    expect(await again.json()).toEqual({ ok: true, duplicate: true })
    expect(afterPixPaid).toHaveBeenCalledTimes(1)
  })

  it('500 when Asaas cannot confirm a paid event (so Asaas retries); the payment stays pending', async () => {
    const { row } = await pendingPayment()
    vi.spyOn(logger, 'error').mockImplementation(() => {})
    asaasGet.mockResolvedValueOnce(new Response('{}', { status: 502 }))
    expect((await POST(request(received()))).status).toBe(500)
    expect(await status(row.id)).toBe('pending')
    // the retry, once Asaas answers, is processed
    expect((await POST(request(received()))).status).toBe(200)
    expect(await status(row.id)).toBe('paid')
  })

  it('logs a 401 once per IP per minute, and answers 429 after 30 rejections per IP per minute', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    const bad = (ip: string) => POST(request(received(), { 'asaas-access-token': 'wrong', 'x-real-ip': ip }))
    for (let i = 0; i < 30; i++) expect((await bad('198.51.100.7')).status).toBe(401)
    expect(rejectedLogs(warn)).toHaveLength(1)
    expect((await bad('198.51.100.7')).status).toBe(429)
    expect(rejectedLogs(warn)).toHaveLength(1)
    // malformed bodies count as rejections too (no log once over the limit)
    expect((await POST(request('{not json', { 'x-real-ip': '198.51.100.7' }))).status).toBe(429)
    expect(rejectedLogs(warn)).toHaveLength(1)
    // another IP has its own budget and its own first log
    expect((await bad('198.51.100.8')).status).toBe(401)
    expect(rejectedLogs(warn)).toHaveLength(2)
    // a valid delivery from the limited IP is still processed (only rejections are limited)
    const { row } = await pendingPayment()
    expect((await POST(request(received(), { 'x-real-ip': '198.51.100.7' }))).status).toBe(200)
    expect(await status(row.id)).toBe('paid')
  })

  it('200 for an unknown payment (ignored)', async () => {
    const res = await POST(request(received('evt_unknown')))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(afterPixPaid).not.toHaveBeenCalled()
  })
})
