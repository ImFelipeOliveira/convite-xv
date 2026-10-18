// Seams between the Pix and gifts tracks: a paid Pix counts as "given" and cancels the gift messages.
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { guestHasGiven, guestHasPaidPix } from '@/features/gifts/given'
import { submitRsvp } from '@/features/rsvp/service'
import { syncGiftMessages } from '@/features/whatsapp/reminders'
import { db } from '@/server/db/client'
import { messageDispatches, pixPayments, type PixStatus } from '@/server/db/schema'
import { makeGuest } from '../../../../tests/helpers/db'
import { afterPixPaid } from '../after-paid'

const PHONE = '+5595991234567'
const T = new Date('2026-11-01T15:00:00Z')

async function pix(guestId: string, status: PixStatus, extra: { refundedAt?: Date } = {}) {
  await db.insert(pixPayments).values({
    guestId,
    amountCents: 10000,
    status,
    paidAt: status === 'paid' ? T : null,
    refundedAt: extra.refundedAt ?? null,
  })
}

async function giftRows(guestId: string) {
  return (await db.select().from(messageDispatches).where(eq(messageDispatches.guestId, guestId)))
    .filter((r) => r.kind === 'gift_list' || r.kind === 'gift_nudge')
    .map((r) => ({ kind: r.kind, status: r.status }))
    .sort((a, b) => a.kind.localeCompare(b.kind))
}

beforeEach(() => vi.stubEnv('FEATURES', 'gifts'))
afterEach(() => vi.unstubAllEnvs())

describe('guestHasPaidPix', () => {
  it('is false without payments and for pending/expired/cancelled/failed ones', async () => {
    const g = await makeGuest()
    expect(await guestHasPaidPix(g.id)).toBe(false)
    for (const s of ['pending', 'expired', 'cancelled', 'failed'] as const) await pix(g.id, s)
    expect(await guestHasPaidPix(g.id)).toBe(false)
    expect(await guestHasGiven(g.id)).toBe(false)
  })

  it('is true with a paid Pix (and guestHasGiven follows)', async () => {
    const g = await makeGuest()
    await pix(g.id, 'paid')
    expect(await guestHasPaidPix(g.id)).toBe(true)
    expect(await guestHasGiven(g.id)).toBe(true)
  })

  it('does not count a refunded Pix, but another paid one still counts', async () => {
    const g = await makeGuest()
    await pix(g.id, 'paid', { refundedAt: T })
    expect(await guestHasPaidPix(g.id)).toBe(false)
    await pix(g.id, 'paid')
    expect(await guestHasPaidPix(g.id)).toBe(true)
  })

  it("ignores other guests' payments", async () => {
    const g = await makeGuest()
    const other = await makeGuest()
    await pix(other.id, 'paid')
    expect(await guestHasPaidPix(g.id)).toBe(false)
  })
})

describe('afterPixPaid', () => {
  it('cancels the pending gift_list and gift_nudge once the guest paid a Pix', async () => {
    const g = await makeGuest({ phone: PHONE })
    expect((await submitRsvp({ token: g.token, status: 'yes', plusOnes: 0 }, T)).ok).toBe(true)
    expect(await giftRows(g.id)).toEqual([
      { kind: 'gift_list', status: 'scheduled' },
      { kind: 'gift_nudge', status: 'scheduled' },
    ])

    await pix(g.id, 'paid')
    await afterPixPaid(g.id, new Date(T.getTime() + 60_000))
    expect(await giftRows(g.id)).toEqual([
      { kind: 'gift_list', status: 'cancelled' },
      { kind: 'gift_nudge', status: 'cancelled' },
    ])
  })

  it('schedules nothing for a paid guest without rows and ignores an unknown guest', async () => {
    const g = await makeGuest({ phone: PHONE, rsvpStatus: 'yes', respondedAt: T })
    await pix(g.id, 'paid')
    await afterPixPaid(g.id, T)
    expect((await giftRows(g.id)).filter((r) => r.status === 'scheduled')).toEqual([])
    await expect(afterPixPaid('00000000-0000-4000-8000-000000000000')).resolves.toBeUndefined()
  })

  it('a refunded Pix does not keep the nudge cancelled on the next guest-driven sync', async () => {
    const g = await makeGuest({ phone: PHONE, rsvpStatus: 'yes', respondedAt: T })
    await pix(g.id, 'paid', { refundedAt: T })
    await syncGiftMessages(g, T, 'gift')
    expect(await giftRows(g.id)).toEqual([{ kind: 'gift_nudge', status: 'scheduled' }])
  })
})
