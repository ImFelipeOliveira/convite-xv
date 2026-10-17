import { describe, expect, it } from 'vitest'
import { makeGuest } from '../../../../tests/helpers/db'
import {
  createGuest,
  deleteGuest,
  findGuestByToken,
  getSummary,
  listGuests,
  markOpened,
  updateGuest,
} from '../repo'

describe('guests repo', () => {
  it('returns null for a malformed token', async () => {
    expect(await findGuestByToken('bad')).toBeNull()
  })

  it('returns null for a valid but nonexistent token', async () => {
    expect(await findGuestByToken('A'.repeat(22))).toBeNull()
  })

  it('finds a guest by token', async () => {
    const g = await createGuest({ name: 'Ana', plusOnesLimit: 1 })
    expect((await findGuestByToken(g.token))?.id).toBe(g.id)
  })

  it('markOpened keeps the first timestamp', async () => {
    const g = await makeGuest()
    await markOpened(g.id)
    const [a] = await listGuests()
    const t1 = a.openedAt
    expect(t1).toBeInstanceOf(Date)
    await new Promise((r) => setTimeout(r, 20))
    await markOpened(g.id)
    const [b] = await listGuests()
    expect(b.openedAt?.getTime()).toBe(t1?.getTime())
  })

  it('creates, updates and deletes', async () => {
    const g = await createGuest({ name: 'Bia', phone: '(95) 99123-4567', plusOnesLimit: 2 })
    expect(g.token).toMatch(/^[0-9A-Za-z]{22}$/)
    const u = await updateGuest(g.id, { name: 'Bianca', plusOnesLimit: 3 })
    expect(u.name).toBe('Bianca')
    expect(u.plusOnesLimit).toBe(3)
    expect(u.updatedAt.getTime()).toBeGreaterThanOrEqual(g.updatedAt.getTime())
    await deleteGuest(g.id)
    expect(await listGuests()).toHaveLength(0)
  })

  it('lists by name with status and search filters', async () => {
    await makeGuest({ name: 'Carla', rsvpStatus: 'yes' })
    await makeGuest({ name: 'Alice' })
    await makeGuest({ name: 'Bruno' })
    expect((await listGuests()).map((g) => g.name)).toEqual(['Alice', 'Bruno', 'Carla'])
    expect((await listGuests({ status: 'yes' })).map((g) => g.name)).toEqual(['Carla'])
    expect((await listGuests({ search: 'bru' })).map((g) => g.name)).toEqual(['Bruno'])
  })

  it('summarizes', async () => {
    await makeGuest({ rsvpStatus: 'yes', plusOnes: 2 })
    await makeGuest({ rsvpStatus: 'yes', plusOnes: 0 })
    await makeGuest({ rsvpStatus: 'no' })
    await makeGuest({ rsvpStatus: 'pending' })
    expect(await getSummary()).toEqual({ total: 4, yes: 2, no: 1, pending: 1, confirmedPeople: 4 })
  })
})
