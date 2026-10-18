import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/server/db/client'
import { gifts } from '@/server/db/schema'
import { makeGuest } from '../../../../tests/helpers/db'
import { releaseGiftAction, reserveGiftAction } from '../actions'
import { createGift } from '../repo'

// each test gets its own client IP so the per-IP rate limit never leaks between tests
const ip = vi.hoisted(() => ({ current: '198.51.100.1' }))
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-real-ip': ip.current }),
}))

const hook = vi.hoisted(() => ({ calls: [] as string[] }))
vi.mock('../after-change', () => ({
  afterGiftChange: async (guestId: string) => {
    hook.calls.push(guestId)
  },
}))

let n = 0
beforeEach(() => {
  ip.current = `198.51.100.${++n}`
  hook.calls = []
})

const base = { category: 'Beleza', priceCents: null, imageUrl: null, purchaseUrl: null }

function form(values: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(values)) fd.set(k, v)
  return fd
}

describe('reserveGiftAction', () => {
  it('reserves a free gift and returns the list with it as mine', async () => {
    const guest = await makeGuest()
    const g = await createGift({ ...base, name: 'Perfume' })
    const other = await createGift({ ...base, name: 'Bolsa' })
    const res = await reserveGiftAction(null, form({ token: guest.token, giftId: g.id }))
    expect(res.ok).toBe(true)
    expect(res.gifts?.find((x) => x.id === g.id)?.state).toBe('mine')
    expect(res.gifts?.find((x) => x.id === other.id)?.state).toBe('free')
    expect(hook.calls).toEqual([guest.id])
  })

  it('answers taken with a refreshed list when someone else got it first', async () => {
    const one = await makeGuest({ name: 'Maria Segredo' })
    const two = await makeGuest()
    const g = await createGift({ ...base, name: 'Perfume' })
    expect((await reserveGiftAction(null, form({ token: one.token, giftId: g.id }))).ok).toBe(true)
    hook.calls = []
    const res = await reserveGiftAction(null, form({ token: two.token, giftId: g.id }))
    expect(res).toMatchObject({ ok: false, error: 'taken' })
    expect(res.gifts?.find((x) => x.id === g.id)?.state).toBe('taken')
    // never another guest's name or id
    expect(JSON.stringify(res)).not.toContain('Maria Segredo')
    expect(JSON.stringify(res)).not.toContain(one.id)
    expect(hook.calls).toEqual([])
  })

  it('answers not_found for an unknown token', async () => {
    const g = await createGift({ ...base, name: 'Perfume' })
    const res = await reserveGiftAction(null, form({ token: 'NaoExiste0000000000000', giftId: g.id }))
    expect(res).toEqual({ ok: false, error: 'not_found' })
  })

  it('answers invalid for a malformed gift id', async () => {
    const guest = await makeGuest()
    const res = await reserveGiftAction(null, form({ token: guest.token, giftId: 'x' }))
    expect(res).toMatchObject({ ok: false, error: 'invalid' })
  })

  it('rate limits per IP (20/min) with invalid', async () => {
    const guest = await makeGuest()
    const g = await createGift({ ...base, name: 'Perfume' })
    for (let i = 0; i < 20; i++) {
      await releaseGiftAction(null, form({ token: guest.token, giftId: g.id }))
    }
    const res = await reserveGiftAction(null, form({ token: guest.token, giftId: g.id }))
    expect(res).toEqual({ ok: false, error: 'invalid' })
    const [row] = await db.select().from(gifts).where(eq(gifts.id, g.id))
    expect(row.guestId).toBeNull()
  })
})

describe('releaseGiftAction', () => {
  it('releases the guest own reservation', async () => {
    const guest = await makeGuest()
    const g = await createGift({ ...base, name: 'Perfume' })
    await reserveGiftAction(null, form({ token: guest.token, giftId: g.id }))
    hook.calls = []
    const res = await releaseGiftAction(null, form({ token: guest.token, giftId: g.id }))
    expect(res.ok).toBe(true)
    expect(res.gifts?.find((x) => x.id === g.id)?.state).toBe('free')
    expect(hook.calls).toEqual([guest.id])
  })

  it("never releases another guest's reservation", async () => {
    const one = await makeGuest({ name: 'Maria Segredo' })
    const two = await makeGuest()
    const g = await createGift({ ...base, name: 'Perfume' })
    await reserveGiftAction(null, form({ token: one.token, giftId: g.id }))
    hook.calls = []
    const res = await releaseGiftAction(null, form({ token: two.token, giftId: g.id }))
    expect(res).toMatchObject({ ok: false, error: 'invalid' })
    expect(res.gifts?.find((x) => x.id === g.id)?.state).toBe('taken')
    expect(JSON.stringify(res)).not.toContain('Maria Segredo')
    const [row] = await db.select().from(gifts).where(eq(gifts.id, g.id))
    expect(row.guestId).toBe(one.id)
    expect(hook.calls).toEqual([])
  })

  it('answers not_found for an unknown token', async () => {
    const g = await createGift({ ...base, name: 'Perfume' })
    const res = await releaseGiftAction(null, form({ token: 'NaoExiste0000000000000', giftId: g.id }))
    expect(res).toEqual({ ok: false, error: 'not_found' })
  })
})
