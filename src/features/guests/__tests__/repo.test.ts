import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from '@/server/db/client'
import { guests } from '@/server/db/schema'
import { makeGuest } from '../../../../tests/helpers/db'
import {
  createGuest,
  createGuests,
  deleteGuest,
  findGuestById,
  findGuestByToken,
  findGuestsByPhone,
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
    expect(await markOpened(g.id)).toBe(true)
    const [a] = await listGuests()
    const t1 = a.openedAt
    expect(t1).toBeInstanceOf(Date)
    await new Promise((r) => setTimeout(r, 20))
    expect(await markOpened(g.id)).toBe(false)
    const [b] = await listGuests()
    expect(b.openedAt?.getTime()).toBe(t1?.getTime())
  })

  it('clamps confirmed plus-ones when the limit is lowered', async () => {
    const g = await createGuest({ name: 'Cris', plusOnesLimit: 3 })
    await db.update(guests).set({ plusOnes: 3 }).where(eq(guests.id, g.id))
    expect((await updateGuest(g.id, { plusOnesLimit: 1 }))?.plusOnes).toBe(1)
    expect((await updateGuest(g.id, { plusOnesLimit: 5 }))?.plusOnes).toBe(1)
  })

  it('creates, updates and deletes', async () => {
    const g = await createGuest({ name: 'Bia', phone: '(95) 99123-4567', plusOnesLimit: 2 })
    expect(g.token).toMatch(/^[0-9A-Za-z]{22}$/)
    const u = await updateGuest(g.id, { name: 'Bianca', plusOnesLimit: 3 })
    expect(u?.name).toBe('Bianca')
    expect(u?.plusOnesLimit).toBe(3)
    expect(u?.updatedAt.getTime()).toBeGreaterThanOrEqual(g.updatedAt.getTime())
    expect((await findGuestById(g.id))?.name).toBe('Bianca')
    await deleteGuest(g.id)
    expect(await findGuestById(g.id)).toBeNull()
    expect(await updateGuest(g.id, { name: 'X' })).toBeUndefined()
    expect(await listGuests()).toHaveLength(0)
  })

  it('createGuests inserts all rows or none', async () => {
    expect(
      await createGuests([
        { name: 'Ana', phone: null, plusOnesLimit: 0 },
        { name: 'Bia', phone: '+5595991234567', plusOnesLimit: 2 },
      ]),
    ).toBe(2)
    expect((await listGuests()).map((g) => g.name)).toEqual(['Ana', 'Bia'])
    await expect(
      createGuests([
        { name: 'Caio', phone: null, plusOnesLimit: 1 },
        { name: 'Duda', phone: null, plusOnesLimit: 9 },
      ]),
    ).rejects.toThrow()
    expect(await listGuests()).toHaveLength(2)
    expect(await createGuests([])).toBe(0)
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
    expect(await getSummary()).toEqual({
      total: 4,
      yes: 2,
      no: 1,
      pending: 1,
      confirmedPeople: 4,
      pendingPeopleMax: 3,
      maxPossiblePeople: 7,
    })
  })

  it('summarizes the people who may still come (pending guests with their limits, "no" excluded)', async () => {
    await makeGuest({ rsvpStatus: 'yes', plusOnes: 1, plusOnesLimit: 3 })
    await makeGuest({ rsvpStatus: 'pending', plusOnesLimit: 0 })
    await makeGuest({ rsvpStatus: 'pending', plusOnesLimit: 4 })
    await makeGuest({ rsvpStatus: 'no', plusOnesLimit: 6 })
    const s = await getSummary()
    expect(s.confirmedPeople).toBe(2)
    expect(s.pendingPeopleMax).toBe(6)
    expect(s.maxPossiblePeople).toBe(8)
  })

  it('summarizes an empty list as zeros', async () => {
    const s = await getSummary()
    expect(s.pendingPeopleMax).toBe(0)
    expect(s.maxPossiblePeople).toBe(0)
  })

  it('findGuestsByPhone normalizes the input and can exclude the guest being edited', async () => {
    const ana = await makeGuest({ name: 'Ana', phone: '+5595991234567' })
    const bia = await makeGuest({ name: 'Bia', phone: '+5595991234567' })
    await makeGuest({ name: 'Caio', phone: '+5595988887777' })
    await makeGuest({ name: 'Duda', phone: null })
    expect((await findGuestsByPhone('(95) 99123-4567')).map((g) => g.name)).toEqual(['Ana', 'Bia'])
    expect(await findGuestsByPhone('+5595991234567', ana.id)).toEqual([{ id: bia.id, name: 'Bia' }])
    expect(await findGuestsByPhone('(95) 97777-6666')).toEqual([])
    expect(await findGuestsByPhone('123')).toEqual([])
  })
})
