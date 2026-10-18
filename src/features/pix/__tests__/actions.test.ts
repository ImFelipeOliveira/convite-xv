import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/server/db/client'
import { pixPayments } from '@/server/db/schema'
import { makeGuest } from '../../../../tests/helpers/db'
import { generatePixAction, pixStatusAction } from '../actions'
import { resetPollClock } from '../service'

// each test gets its own client IP so the per-IP rate limit never leaks between tests
const ip = vi.hoisted(() => ({ current: '198.51.100.1' }))
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-real-ip': ip.current }),
}))

const VALID_CPF = '529.982.247-25'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

/** Global fetch stand-in for Asaas (the actions read the config from env). */
function stubAsaas(opts: { failPayments?: boolean; status?: string } = {}) {
  const calls: string[] = []
  let n = 0
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace('http://asaas.test/v3', '')
    const key = `${init?.method ?? 'GET'} ${path.replace(/^\/payments\/[^/]+/, '/payments/:id')}`
    calls.push(key)
    if (key === 'POST /customers') return json({ id: 'cus_1' })
    if (key === 'POST /payments') return opts.failPayments ? json({}, 500) : json({ id: `pay_${++n}` })
    if (key === 'GET /payments/:id/pixQrCode')
      return json({ encodedImage: 'iVBORw0KGgo=', payload: '00020126abc', expirationDate: '2099-01-01 23:59:59' })
    if (key === 'GET /payments/:id') return json({ status: opts.status ?? 'PENDING' })
    return json({}, 404)
  })
  vi.stubGlobal('fetch', fn)
  return calls
}

function form(values: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(values)) fd.set(k, v)
  return fd
}

let n = 0
beforeEach(() => {
  ip.current = `198.51.100.${++n}`
  resetPollClock()
  vi.stubEnv('FEATURES', 'pix')
  vi.stubEnv('ASAAS_API_KEY', 'test-key')
  vi.stubEnv('ASAAS_BASE_URL', 'http://asaas.test/v3')
  vi.stubEnv('ASAAS_REQUIRE_PAYER_CPF', 'true')
  vi.stubEnv('PIX_POLL_AFTER_MS', '0')
  vi.stubEnv('PIX_POLL_EVERY_MS', '0')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('generatePixAction', () => {
  it('creates a charge for the token’s guest and returns its QR', async () => {
    const guest = await makeGuest()
    stubAsaas()
    const res = await generatePixAction(null, form({ token: guest.token, amount: '10000', cpf: VALID_CPF }))
    expect(res).toMatchObject({
      ok: true,
      payment: { amountCents: 10000, status: 'pending', qrImage: 'iVBORw0KGgo=', copyPaste: '00020126abc' },
    })
    const rows = await db.select().from(pixPayments)
    expect(rows).toHaveLength(1)
    expect(rows[0].guestId).toBe(guest.id)
  })

  it('rejects below the minimum without calling Asaas', async () => {
    const guest = await makeGuest()
    const calls = stubAsaas()
    expect(await generatePixAction(null, form({ token: guest.token, amount: '5000', cpf: VALID_CPF }))).toEqual({
      ok: false,
      error: 'below_minimum',
    })
    expect(calls).toEqual([])
  })

  it('rejects above the R$ 10.000,00 maximum without calling Asaas', async () => {
    const guest = await makeGuest()
    const calls = stubAsaas()
    expect(await generatePixAction(null, form({ token: guest.token, amount: '1000001', cpf: VALID_CPF }))).toEqual({
      ok: false,
      error: 'above_maximum',
    })
    expect(calls).toEqual([])
  })

  it('rejects a malformed amount', async () => {
    const guest = await makeGuest()
    const calls = stubAsaas()
    for (const amount of ['', 'abc', '100.5', '-7000', '1e9']) {
      expect(await generatePixAction(null, form({ token: guest.token, amount, cpf: VALID_CPF }))).toEqual({
        ok: false,
        error: 'invalid',
      })
    }
    expect(calls).toEqual([])
  })

  it('answers invalid_cpf for a bad CPF', async () => {
    const guest = await makeGuest()
    stubAsaas()
    expect(
      await generatePixAction(null, form({ token: guest.token, amount: '7000', cpf: '529.982.247-24' })),
    ).toEqual({ ok: false, error: 'invalid_cpf' })
  })

  it('answers not_found for an unknown token', async () => {
    const calls = stubAsaas()
    expect(await generatePixAction(null, form({ token: 'nope', amount: '7000', cpf: VALID_CPF }))).toEqual({
      ok: false,
      error: 'not_found',
    })
    expect(calls).toEqual([])
  })

  it('maps an Asaas failure to unavailable', async () => {
    const guest = await makeGuest()
    stubAsaas({ failPayments: true })
    expect(await generatePixAction(null, form({ token: guest.token, amount: '7000', cpf: VALID_CPF }))).toEqual({
      ok: false,
      error: 'unavailable',
    })
  })

  it('answers not_configured without Asaas config, and with the pix flag off', async () => {
    const guest = await makeGuest()
    const calls = stubAsaas()
    vi.stubEnv('ASAAS_API_KEY', '')
    expect(await generatePixAction(null, form({ token: guest.token, amount: '7000', cpf: VALID_CPF }))).toEqual({
      ok: false,
      error: 'not_configured',
    })
    vi.stubEnv('ASAAS_API_KEY', 'test-key')
    vi.stubEnv('FEATURES', 'gifts')
    expect(await generatePixAction(null, form({ token: guest.token, amount: '7000', cpf: VALID_CPF }))).toEqual({
      ok: false,
      error: 'not_configured',
    })
    expect(calls).toEqual([])
  })

  it('rate limits per IP: 10 per minute', async () => {
    const calls = stubAsaas()
    for (let i = 0; i < 10; i++) {
      expect((await generatePixAction(null, form({ token: 'nope', amount: '7000' }))).ok).toBe(false)
    }
    expect(await generatePixAction(null, form({ token: 'nope', amount: '7000' }))).toEqual({
      ok: false,
      error: 'busy',
    })
    expect(calls).toEqual([])
  })
})

describe('pixStatusAction', () => {
  async function charge() {
    const guest = await makeGuest()
    const res = await generatePixAction(null, form({ token: guest.token, amount: '7000', cpf: VALID_CPF }))
    if (!res.ok) throw new Error('expected ok')
    return { guest, payment: res.payment }
  }

  it('returns the status of the guest’s own payment (polling Asaas when due)', async () => {
    stubAsaas({ status: 'RECEIVED' })
    const { guest, payment } = await charge()
    const res = await pixStatusAction(guest.token, payment.id)
    expect(res).toMatchObject({ ok: true, status: 'paid' })
  })

  it('answers not_found for another guest’s payment, an unknown token or a bad id', async () => {
    stubAsaas()
    const { payment } = await charge()
    const other = await makeGuest()
    expect(await pixStatusAction(other.token, payment.id)).toEqual({ ok: false, error: 'not_found' })
    expect(await pixStatusAction('nope', payment.id)).toEqual({ ok: false, error: 'not_found' })
    expect(await pixStatusAction(other.token, 'not-a-uuid')).toEqual({ ok: false, error: 'not_found' })
  })

  it('has its own per-IP limit, roomy enough for a 5 s poll', async () => {
    stubAsaas()
    const { guest, payment } = await charge()
    for (let i = 0; i < 30; i++) expect((await pixStatusAction(guest.token, payment.id)).ok).toBe(true)
    expect(await pixStatusAction(guest.token, payment.id)).toEqual({ ok: false, error: 'busy' })
  })
})
