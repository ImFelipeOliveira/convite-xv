import { eq, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getSettings } from '@/features/settings/repo'
import { db } from '@/server/db/client'
import { guests, pixPayments } from '@/server/db/schema'
import { makeGuest } from '../../../../tests/helpers/db'
import { withAdvisoryLock } from '../repo'
import { GENERIC_CUSTOMER_NAME, generatePix, getGuestPixState, getPixStatus, resetPollClock } from '../service'

const config = { apiKey: 'k', baseUrl: 'http://asaas.test/v3', webhookToken: null }
const NOW = new Date('2026-10-18T15:00:00Z') // 11h in Boa Vista

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

type Route = (init: RequestInit | undefined, url: string) => Response | Promise<Response>

/** Fake Asaas: routes "METHOD /path" (path relative to /v3) to handlers; records every call. */
function fakeAsaas(overrides: Record<string, Route> = {}) {
  let customerN = 0
  let paymentN = 0
  const routes: Record<string, Route> = {
    'POST /customers': () => json({ id: `cus_${++customerN}` }),
    'POST /payments': () => json({ id: `pay_${++paymentN}`, status: 'PENDING' }),
    'GET /payments/:id/pixQrCode': () =>
      json({
        encodedImage: 'iVBORw0KGgo=',
        payload: '00020126580014br.gov.bcb.pix',
        expirationDate: '2026-10-19 23:59:59',
      }),
    'GET /payments/:id': () => json({ status: 'PENDING' }),
    'DELETE /payments/:id': () => json({ deleted: true }),
    ...overrides,
  }
  const calls: { key: string; body: unknown }[] = []
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const path = url.replace(config.baseUrl, '')
    const key = `${init?.method ?? 'GET'} ${path.replace(/^\/payments\/[^/]+/, '/payments/:id')}`
    calls.push({ key, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    // network latency, so concurrent calls really interleave
    await new Promise((r) => setTimeout(r, 5))
    const route = routes[key]
    if (!route) return json({}, 404)
    return route(init, url)
  }) as unknown as typeof fetch
  return { fetch: fetchImpl, calls }
}

function deps(f: ReturnType<typeof fakeAsaas>, extra: Record<string, unknown> = {}) {
  return { config, fetch: f.fetch, now: () => NOW, requireCpf: false, ...extra }
}

async function rows() {
  return db.select().from(pixPayments)
}

beforeEach(() => resetPollClock())
afterEach(() => vi.unstubAllEnvs())

describe('generatePix', () => {
  it('rejects below the R$ 70 minimum without calling Asaas', async () => {
    const guest = await makeGuest()
    const f = fakeAsaas()
    expect(await generatePix(guest, 6999, deps(f))).toEqual({ ok: false, error: 'below_minimum' })
    expect(await generatePix(guest, 7000.5, deps(f))).toEqual({ ok: false, error: 'below_minimum' })
    expect(f.calls).toEqual([])
    expect(await rows()).toEqual([])
  })

  it('rejects above the R$ 10.000,00 maximum without calling Asaas (exactly R$ 10.000,00 is fine)', async () => {
    const guest = await makeGuest()
    const f = fakeAsaas()
    expect(await generatePix(guest, 1_000_001, deps(f))).toEqual({ ok: false, error: 'above_maximum' })
    expect(f.calls).toEqual([])
    expect(await generatePix(guest, 1_000_000, deps(f))).toMatchObject({ ok: true, payment: { amountCents: 1_000_000 } })
  })

  it('answers not_configured without an Asaas config', async () => {
    const guest = await makeGuest()
    const f = fakeAsaas()
    expect(await generatePix(guest, 7000, deps(f, { config: null }))).toEqual({
      ok: false,
      error: 'not_configured',
    })
    expect(f.calls).toEqual([])
  })

  it('creates one pending row with the QR after Asaas answers', async () => {
    const guest = await makeGuest()
    const f = fakeAsaas()
    const r = await generatePix(guest, 10000, deps(f))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.payment).toMatchObject({
      amountCents: 10000,
      status: 'pending',
      qrImage: 'iVBORw0KGgo=',
      copyPaste: '00020126580014br.gov.bcb.pix',
      // 23:59:59 in Brasília (UTC−3)
      expiresAt: '2026-10-20T02:59:59.000Z',
      paidAt: null,
    })
    const all = await rows()
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({
      id: r.payment.id,
      guestId: guest.id,
      amountCents: 10000,
      asaasPaymentId: 'pay_1',
      status: 'pending',
    })
    const payment = f.calls.find((c) => c.key === 'POST /payments')
    expect(payment?.body).toMatchObject({
      customer: 'cus_1',
      billingType: 'PIX',
      value: 100,
      // tomorrow in São Paulo (Asaas calendar): never a past date for late-night charges
      dueDate: '2026-10-19',
      externalReference: r.payment.id,
    })
  })

  it('creates the generic customer once without CPF and caches its id in settings', async () => {
    const one = await makeGuest({ name: 'Maria Segredo' })
    const two = await makeGuest()
    const f = fakeAsaas()
    expect((await generatePix(one, 7000, deps(f))).ok).toBe(true)
    expect((await generatePix(two, 7000, deps(f))).ok).toBe(true)
    const customers = f.calls.filter((c) => c.key === 'POST /customers')
    expect(customers).toHaveLength(1)
    expect(customers[0].body).toEqual({ name: GENERIC_CUSTOMER_NAME, notificationDisabled: true })
    expect(GENERIC_CUSTOMER_NAME).toBe('Convidados — 15 anos da Isabella')
    expect((await getSettings()).asaasCustomerId).toBe('cus_1')
  })

  it('maps an Asaas failure to unavailable and leaves no row', async () => {
    const guest = await makeGuest()
    const f = fakeAsaas({ 'POST /payments': () => json({}, 500) })
    expect(await generatePix(guest, 7000, deps(f))).toEqual({ ok: false, error: 'unavailable' })
    expect(await rows()).toEqual([])
  })

  it('maps a customer failure to unavailable and caches nothing', async () => {
    const guest = await makeGuest()
    const f = fakeAsaas({ 'POST /customers': () => json({}, 400) })
    expect(await generatePix(guest, 7000, deps(f))).toEqual({ ok: false, error: 'unavailable' })
    expect(await rows()).toEqual([])
    expect((await getSettings()).asaasCustomerId).toBeNull()
  })

  it('cancels the charge at Asaas and leaves no row when the QR fetch fails', async () => {
    const guest = await makeGuest()
    const f = fakeAsaas({
      'GET /payments/:id/pixQrCode': () => {
        throw new DOMException('t', 'TimeoutError')
      },
    })
    expect(await generatePix(guest, 7000, deps(f))).toEqual({ ok: false, error: 'unavailable' })
    expect(await rows()).toEqual([])
    expect(f.calls.map((c) => c.key)).toContain('DELETE /payments/:id')
  })

  it('reuses a pending, unexpired payment for the same guest and amount', async () => {
    const guest = await makeGuest()
    const f = fakeAsaas()
    const a = await generatePix(guest, 7000, deps(f))
    const b = await generatePix(guest, 7000, deps(f))
    expect(a.ok && b.ok).toBe(true)
    if (!a.ok || !b.ok) return
    expect(b.payment.id).toBe(a.payment.id)
    expect(f.calls.filter((c) => c.key === 'POST /payments')).toHaveLength(1)
    expect(await rows()).toHaveLength(1)
  })

  it('creates a new charge for another amount, another guest or after expiry', async () => {
    const guest = await makeGuest()
    const other = await makeGuest()
    const f = fakeAsaas()
    await generatePix(guest, 7000, deps(f))
    await generatePix(guest, 10000, deps(f))
    await generatePix(other, 7000, deps(f))
    const later = new Date('2026-10-20T03:00:00Z')
    await generatePix(guest, 7000, deps(f, { now: () => later }))
    expect(f.calls.filter((c) => c.key === 'POST /payments')).toHaveLength(4)
    expect(await rows()).toHaveLength(4)
  })

  it('does not reuse a payment that is no longer pending', async () => {
    const guest = await makeGuest()
    const f = fakeAsaas()
    const a = await generatePix(guest, 7000, deps(f))
    if (!a.ok) throw new Error('expected ok')
    await db.update(pixPayments).set({ status: 'paid' }).where(eq(pixPayments.id, a.payment.id))
    const b = await generatePix(guest, 7000, deps(f))
    expect(b.ok && b.payment.id !== a.payment.id).toBe(true)
  })

  it('uses tomorrow in São Paulo as the due date (23:30 Boa Vista = 00:30 São Paulo next day)', async () => {
    const guest = await makeGuest()
    const f = fakeAsaas()
    const lateNight = new Date('2026-10-19T03:30:00Z') // 18/10 23:30 in Boa Vista, 19/10 00:30 in São Paulo
    expect((await generatePix(guest, 7000, deps(f, { now: () => lateNight }))).ok).toBe(true)
    expect(f.calls.find((c) => c.key === 'POST /payments')?.body).toMatchObject({ dueDate: '2026-10-20' })
  })

  it('crosses month and year ends for the due date', async () => {
    const guest = await makeGuest()
    const f = fakeAsaas()
    await generatePix(guest, 7000, deps(f, { now: () => new Date('2026-12-31T12:00:00Z') }))
    expect(f.calls.find((c) => c.key === 'POST /payments')?.body).toMatchObject({ dueDate: '2027-01-01' })
  })

  it('does not reuse a payment expiring within 15 minutes', async () => {
    const guest = await makeGuest()
    const f = fakeAsaas()
    const a = await generatePix(guest, 7000, deps(f))
    // QR expires 2026-10-20T02:59:59Z
    const close = new Date('2026-10-20T02:46:00Z')
    const b = await generatePix(guest, 7000, deps(f, { now: () => close }))
    expect(a.ok && b.ok && a.payment.id !== b.payment.id).toBe(true)
    const safe = new Date('2026-10-20T02:44:00Z')
    const c = await generatePix(guest, 7000, deps(f, { now: () => safe }))
    expect(a.ok && c.ok && c.payment.id === a.payment.id).toBe(true)
  })

  it('does not reuse a payment without a known expiry', async () => {
    const guest = await makeGuest()
    const f = fakeAsaas({
      'GET /payments/:id/pixQrCode': () => json({ encodedImage: 'x', payload: 'y', expirationDate: 'soon' }),
    })
    const a = await generatePix(guest, 7000, deps(f))
    const b = await generatePix(guest, 7000, deps(f))
    expect(a.ok && b.ok && a.payment.id !== b.payment.id).toBe(true)
  })

  it('returns the same payment for a concurrent double submit', async () => {
    const guest = await makeGuest()
    const f = fakeAsaas()
    const [a, b] = await Promise.all([
      generatePix(guest, 7000, deps(f)),
      generatePix(guest, 7000, deps(f)),
    ])
    expect(a.ok && b.ok && a.payment.id === b.payment.id).toBe(true)
    expect(f.calls.filter((c) => c.key === 'POST /payments')).toHaveLength(1)
    expect(await rows()).toHaveLength(1)
  })

  it('creates the generic customer once under concurrent first charges', async () => {
    const one = await makeGuest()
    const two = await makeGuest()
    const f = fakeAsaas()
    const [a, b] = await Promise.all([generatePix(one, 7000, deps(f)), generatePix(two, 7000, deps(f))])
    expect(a.ok && b.ok).toBe(true)
    expect(f.calls.filter((c) => c.key === 'POST /customers')).toHaveLength(1)
  })

  it('deletes the charge and answers unavailable when saving our row fails', async () => {
    const guest = await makeGuest()
    const f = fakeAsaas({
      'POST /payments': async () => {
        // guest removed meanwhile: the insert violates the guest foreign key
        await db.delete(guests).where(eq(guests.id, guest.id))
        return json({ id: 'pay_x', status: 'PENDING' })
      },
    })
    expect(await generatePix(guest, 7000, deps(f))).toEqual({ ok: false, error: 'unavailable' })
    expect(await rows()).toEqual([])
    expect(f.calls.map((c) => c.key)).toContain('DELETE /payments/:id')
  })

  describe('payer CPF mode', () => {
    it('shows an existing pending QR for the same amount without asking the CPF again', async () => {
      const guest = await makeGuest()
      const f = fakeAsaas()
      const d = deps(f, { requireCpf: true })
      const a = await generatePix(guest, 7000, d, { cpf: '529.982.247-25' })
      const b = await generatePix(guest, 7000, d)
      expect(a.ok && b.ok && a.payment.id === b.payment.id).toBe(true)
      expect(await generatePix(guest, 10000, d)).toEqual({ ok: false, error: 'cpf_required' })
    })

    it('requires a CPF', async () => {
      const guest = await makeGuest()
      const f = fakeAsaas()
      expect(await generatePix(guest, 7000, deps(f, { requireCpf: true }))).toEqual({
        ok: false,
        error: 'cpf_required',
      })
      expect(f.calls).toEqual([])
    })

    it('rejects an invalid CPF', async () => {
      const guest = await makeGuest()
      const f = fakeAsaas()
      expect(
        await generatePix(guest, 7000, deps(f, { requireCpf: true }), { cpf: '529.982.247-24' }),
      ).toEqual({ ok: false, error: 'invalid_cpf' })
      expect(f.calls).toEqual([])
    })

    it('creates one customer per guest with the CPF, stores only the customer id, then reuses it', async () => {
      const guest = await makeGuest({ name: 'Ana Souza' })
      const f = fakeAsaas()
      const d = deps(f, { requireCpf: true })
      expect((await generatePix(guest, 7000, d, { cpf: '529.982.247-25' })).ok).toBe(true)
      expect((await generatePix(guest, 10000, d, { cpf: '529.982.247-25' })).ok).toBe(true)
      const customers = f.calls.filter((c) => c.key === 'POST /customers')
      expect(customers).toHaveLength(1)
      expect(customers[0].body).toEqual({
        name: 'Ana Souza',
        cpfCnpj: '52998224725',
        notificationDisabled: true,
      })
      const [row] = await db.select().from(guests).where(eq(guests.id, guest.id))
      expect(row.asaasCustomerId).toBe('cus_1')
      expect(JSON.stringify(row)).not.toContain('52998224725')
      expect(JSON.stringify(await rows())).not.toContain('52998224725')
      expect((await getSettings()).asaasCustomerId).toBeNull()
    })
  })
})

describe('getPixStatus', () => {
  async function seed(f: ReturnType<typeof fakeAsaas>) {
    const guest = await makeGuest()
    const r = await generatePix(guest, 7000, deps(f))
    if (!r.ok) throw new Error('expected ok')
    return { guest, payment: r.payment }
  }

  it('reads our DB and does not poll Asaas in the first 2 minutes', async () => {
    const f = fakeAsaas({ 'GET /payments/:id': () => json({ status: 'RECEIVED' }) })
    const { guest, payment } = await seed(f)
    const soon = new Date(NOW.getTime() + 60_000)
    const view = await getPixStatus(guest.id, payment.id, deps(f, { now: () => soon }))
    expect(view?.status).toBe('pending')
    expect(f.calls.filter((c) => c.key === 'GET /payments/:id')).toHaveLength(0)
  })

  it('returns null for another guest’s payment', async () => {
    const f = fakeAsaas()
    const { payment } = await seed(f)
    const other = await makeGuest()
    expect(await getPixStatus(other.id, payment.id, deps(f))).toBeNull()
    expect(await getPixStatus(other.id, 'not-a-uuid', deps(f))).toBeNull()
  })

  it('after 2 minutes polls at most once per 30 s and stores a paid status', async () => {
    let status = 'PENDING'
    const f = fakeAsaas({ 'GET /payments/:id': () => json({ status }) })
    const { guest, payment } = await seed(f)
    const polls = () => f.calls.filter((c) => c.key === 'GET /payments/:id').length
    const t0 = NOW.getTime() + 3 * 60_000
    const at = (ms: number) => deps(f, { now: () => new Date(t0 + ms) })

    expect((await getPixStatus(guest.id, payment.id, at(0)))?.status).toBe('pending')
    expect(polls()).toBe(1)
    status = 'RECEIVED'
    expect((await getPixStatus(guest.id, payment.id, at(10_000)))?.status).toBe('pending')
    expect(polls()).toBe(1)
    const view = await getPixStatus(guest.id, payment.id, at(31_000))
    expect(polls()).toBe(2)
    expect(view?.status).toBe('paid')
    expect(view?.paidAt).toBe(new Date(t0 + 31_000).toISOString())
    const [row] = await db.select().from(pixPayments).where(eq(pixPayments.id, payment.id))
    expect(row.status).toBe('paid')
    // paid is final: no more polling
    await getPixStatus(guest.id, payment.id, at(120_000))
    expect(polls()).toBe(2)
  })

  it('keeps the stored status when the poll fails', async () => {
    const f = fakeAsaas({ 'GET /payments/:id': () => json({}, 500) })
    const { guest, payment } = await seed(f)
    const later = new Date(NOW.getTime() + 3 * 60_000)
    expect((await getPixStatus(guest.id, payment.id, deps(f, { now: () => later })))?.status).toBe(
      'pending',
    )
  })
})

describe('generatePix boundary', () => {
  it('answers unavailable (never throws) when something unexpected throws inside', async () => {
    const guest = await makeGuest()
    const f = fakeAsaas()
    const boom = () => {
      throw new Error('pool exhausted')
    }
    expect(await generatePix(guest, 7000, deps(f, { now: boom }))).toEqual({ ok: false, error: 'unavailable' })
    // the slot was released: a normal call still works
    expect((await generatePix(guest, 7000, deps(f))).ok).toBe(true)
  })

  it('lets at most 4 generations run at once; the excess waits briefly, then answers busy', async () => {
    let open!: () => void
    const gate = new Promise<void>((r) => (open = r))
    const f = fakeAsaas({
      'POST /payments': async () => {
        await gate
        return json({ id: `pay_${Math.random()}`, status: 'PENDING' })
      },
    })
    const list = await Promise.all(Array.from({ length: 6 }, () => makeGuest()))
    const pending = list.map((g) => generatePix(g, 7000, deps(f, { slotWaitMs: 100 })))
    // the two over the limit give up after waiting 100 ms while the first four hang on Asaas
    await new Promise((r) => setTimeout(r, 400))
    open()
    const results = await Promise.all(pending)
    expect(results.filter((r) => r.ok)).toHaveLength(4)
    expect(results.filter((r) => !r.ok && r.error === 'busy')).toHaveLength(2)
  })

  it('a waiting generation takes the slot freed by a finished one', async () => {
    const f = fakeAsaas()
    const list = await Promise.all(Array.from({ length: 6 }, () => makeGuest()))
    const results = await Promise.all(list.map((g) => generatePix(g, 7000, deps(f, { slotWaitMs: 5_000 }))))
    expect(results.every((r) => r.ok)).toBe(true)
  })

  it('sets a 20 s lock_timeout once the advisory lock is held', async () => {
    const value = await withAdvisoryLock('test:lock-timeout', async (tx) => {
      const res = await tx.execute(sql`show lock_timeout`)
      return (res as unknown as { lock_timeout: string }[])[0].lock_timeout
    })
    expect(value).toBe('20s')
  })
})

describe('getPixStatus poll threshold', () => {
  it('polls right away when PIX_POLL_AFTER_MS / PIX_POLL_EVERY_MS are 0 (e2e)', async () => {
    vi.stubEnv('PIX_POLL_AFTER_MS', '0')
    vi.stubEnv('PIX_POLL_EVERY_MS', '0')
    let status = 'PENDING'
    const f = fakeAsaas({ 'GET /payments/:id': () => json({ status }) })
    const guest = await makeGuest()
    const r = await generatePix(guest, 7000, deps(f))
    if (!r.ok) throw new Error('expected ok')
    expect((await getPixStatus(guest.id, r.payment.id, deps(f)))?.status).toBe('pending')
    status = 'RECEIVED'
    expect((await getPixStatus(guest.id, r.payment.id, deps(f)))?.status).toBe('paid')
    expect(f.calls.filter((c) => c.key === 'GET /payments/:id')).toHaveLength(2)
  })
})

describe('getGuestPixState', () => {
  it('is empty for a guest without charges', async () => {
    const guest = await makeGuest()
    expect(await getGuestPixState(guest.id, NOW)).toEqual({ current: null, paidCents: null })
  })

  it('shows a still payable pending charge, ignoring expired and other guests’ ones', async () => {
    const guest = await makeGuest()
    const other = await makeGuest()
    const f = fakeAsaas()
    const mine = await generatePix(guest, 10000, deps(f))
    await generatePix(other, 7000, deps(f))
    if (!mine.ok) throw new Error('expected ok')
    expect(await getGuestPixState(guest.id, NOW)).toEqual({ current: mine.payment, paidCents: null })
    // past its expiry: nothing to show
    expect(await getGuestPixState(guest.id, new Date('2026-10-21T00:00:00Z'))).toEqual({
      current: null,
      paidCents: null,
    })
  })

  it('reports the newest paid charge (paid wins over an older pending one)', async () => {
    const guest = await makeGuest()
    const f = fakeAsaas()
    const a = await generatePix(guest, 7000, deps(f))
    const b = await generatePix(guest, 15000, deps(f, { now: () => new Date(NOW.getTime() + 1000) }))
    if (!a.ok || !b.ok) throw new Error('expected ok')
    await db.update(pixPayments).set({ status: 'paid', paidAt: NOW }).where(eq(pixPayments.id, b.payment.id))
    const state = await getGuestPixState(guest.id, NOW)
    expect(state.paidCents).toBe(15000)
    expect(state.current).toMatchObject({ id: b.payment.id, status: 'paid' })
  })
})
