import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { guests, settings } from '@/server/db/schema'
import { generateToken } from '@/features/guests/token'
import { makeGuest } from '../../../../tests/helpers/db'
import { submitRsvp } from '../service'

const NOW = new Date('2026-11-01T12:00:00Z')

async function guestRow(id: string) {
  const [row] = await db.select().from(guests).where(eq(guests.id, id))
  return row
}

describe('submitRsvp', () => {
  beforeEach(async () => {
    await db.insert(settings).values({ id: 1 }).onConflictDoNothing()
  })

  it('accepts yes with 2 plus-ones within limit 2', async () => {
    const g = await makeGuest({ plusOnesLimit: 2 })
    const r = await submitRsvp({ token: g.token, status: 'yes', plusOnes: 2 }, NOW)
    expect(r.ok).toBe(true)
    const row = await guestRow(g.id)
    expect(row.rsvpStatus).toBe('yes')
    expect(row.plusOnes).toBe(2)
    expect(row.respondedAt).toEqual(NOW)
  })

  it('rejects over limit and leaves the database untouched', async () => {
    const g = await makeGuest({ plusOnesLimit: 1 })
    const r = await submitRsvp({ token: g.token, status: 'yes', plusOnes: 2 }, NOW)
    expect(r).toEqual({ ok: false, error: 'over_limit' })
    const row = await guestRow(g.id)
    expect(row.rsvpStatus).toBe('pending')
    expect(row.plusOnes).toBe(0)
    expect(row.respondedAt).toBeNull()
  })

  it('rejects negative plus-ones as invalid', async () => {
    const g = await makeGuest()
    const r = await submitRsvp({ token: g.token, status: 'yes', plusOnes: -1 }, NOW)
    expect(r).toEqual({ ok: false, error: 'invalid' })
  })

  it('zeroes plus-ones when declining', async () => {
    const g = await makeGuest({ plusOnesLimit: 3 })
    const r = await submitRsvp({ token: g.token, status: 'no', plusOnes: 3 }, NOW)
    expect(r.ok).toBe(true)
    const row = await guestRow(g.id)
    expect(row.rsvpStatus).toBe('no')
    expect(row.plusOnes).toBe(0)
  })

  it('is idempotent for identical resubmission', async () => {
    const g = await makeGuest({ plusOnesLimit: 2 })
    const input = { token: g.token, status: 'yes', plusOnes: 1, message: 'See you' }
    expect((await submitRsvp(input, NOW)).ok).toBe(true)
    const first = await guestRow(g.id)
    expect((await submitRsvp(input, NOW)).ok).toBe(true)
    const all = await db.select().from(guests)
    expect(all).toHaveLength(1)
    const second = await guestRow(g.id)
    expect(second.rsvpStatus).toBe(first.rsvpStatus)
    expect(second.plusOnes).toBe(first.plusOnes)
    expect(second.message).toBe(first.message)
    expect(second.respondedAt).toEqual(first.respondedAt)
  })

  it('allows changing from yes to no', async () => {
    const g = await makeGuest({ plusOnesLimit: 2 })
    await submitRsvp({ token: g.token, status: 'yes', plusOnes: 2 }, NOW)
    const r = await submitRsvp({ token: g.token, status: 'no' }, NOW)
    expect(r.ok).toBe(true)
    const row = await guestRow(g.id)
    expect(row.rsvpStatus).toBe('no')
    expect(row.plusOnes).toBe(0)
  })

  it('rejects after the deadline', async () => {
    const g = await makeGuest()
    await db.update(settings).set({ rsvpDeadline: '2026-12-13' }).where(eq(settings.id, 1))
    const r = await submitRsvp(
      { token: g.token, status: 'yes', plusOnes: 0 },
      new Date('2026-12-14T05:00:00Z'),
    )
    expect(r).toEqual({ ok: false, error: 'deadline_passed' })
  })

  it('saves the phone when the guest has none', async () => {
    const g = await makeGuest({ phone: null })
    const r = await submitRsvp(
      { token: g.token, status: 'yes', plusOnes: 0, phone: '(95) 99123-4567' },
      NOW,
    )
    expect(r.ok).toBe(true)
    expect((await guestRow(g.id)).phone).toBe('+5595991234567')
  })

  it('keeps the registered phone', async () => {
    const g = await makeGuest({ phone: '+5595900000000' })
    const r = await submitRsvp(
      { token: g.token, status: 'yes', plusOnes: 0, phone: '(95) 99123-4567' },
      NOW,
    )
    expect(r.ok).toBe(true)
    expect((await guestRow(g.id)).phone).toBe('+5595900000000')
  })

  it('rejects an invalid phone', async () => {
    const g = await makeGuest({ phone: null })
    const r = await submitRsvp(
      { token: g.token, status: 'yes', plusOnes: 0, phone: '123' },
      NOW,
    )
    expect(r).toEqual({ ok: false, error: 'invalid_phone' })
  })

  it('returns not_found for an unknown token', async () => {
    const r = await submitRsvp({ token: 'A'.repeat(22), status: 'yes', plusOnes: 0 }, NOW)
    expect(r).toEqual({ ok: false, error: 'not_found' })
  })

  it('rejects a message with 501 chars', async () => {
    const g = await makeGuest()
    const r = await submitRsvp(
      { token: g.token, status: 'yes', plusOnes: 0, message: 'x'.repeat(501) },
      NOW,
    )
    expect(r).toEqual({ ok: false, error: 'invalid' })
  })
})
