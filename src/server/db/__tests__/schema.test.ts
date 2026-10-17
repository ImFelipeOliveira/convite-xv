import { describe, expect, it } from 'vitest'
import { db } from '@/server/db/client'
import { guests, settings } from '@/server/db/schema'
import { makeGuest } from '../../../../tests/helpers/db'

describe('schema', () => {
  it('inserts a guest with defaults', async () => {
    const guest = await makeGuest()
    expect(guest.rsvpStatus).toBe('pending')
    expect(guest.plusOnes).toBe(0)
  })

  it('rejects a plus-ones limit of 7', async () => {
    await expect(makeGuest({ plusOnesLimit: 7 })).rejects.toThrow()
  })

  it('enforces unique tokens', async () => {
    await makeGuest({ token: 'abc' })
    await expect(makeGuest({ token: 'abc' })).rejects.toThrow()
  })

  it('keeps settings as a single row', async () => {
    await expect(db.insert(settings).values({ id: 2 })).rejects.toThrow()
    const rows = await db.select().from(settings)
    expect(rows).toHaveLength(1)
    expect(rows[0].rsvpDeadline).toBe('2026-12-13')
  })

  it('resetDatabase empties guests', async () => {
    expect(await db.select().from(guests)).toHaveLength(0)
  })
})
