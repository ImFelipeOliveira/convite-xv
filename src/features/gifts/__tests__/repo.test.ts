import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from '@/server/db/client'
import { gifts, guests } from '@/server/db/schema'
import { makeGuest } from '../../../../tests/helpers/db'
import {
  adminReleaseGift,
  countGifts,
  createGift,
  deleteGift,
  guestHasGift,
  listGiftsAdmin,
  releaseGift,
  reserveGift,
  updateGift,
} from '../repo'
import { toGiftViews } from '../view'

const base = { name: 'Panela', category: 'Cozinha', priceCents: 25000, imageUrl: null, purchaseUrl: null }

describe('gifts repo', () => {
  it('creates, lists (ordered), updates and deletes', async () => {
    const b = await createGift({ ...base, name: 'B', category: 'Quarto' })
    const a = await createGift({ ...base, name: 'A', category: 'Cozinha' })
    const list = await listGiftsAdmin()
    expect(list.map((g) => g.name)).toEqual(['A', 'B'])
    expect(list[0].reservedByName).toBeNull()
    expect(list[0].reservedByStatus).toBeNull()

    const up = await updateGift(a.id, { ...base, name: 'A2', category: 'Cozinha' })
    expect(up?.name).toBe('A2')
    expect((await deleteGift(b.id))?.id).toBe(b.id)
    expect(await deleteGift(b.id)).toBeNull()
  })

  it('reserves a free gift, then reports taken and not_found', async () => {
    const g = await createGift(base)
    const one = await makeGuest()
    const two = await makeGuest()
    expect(await reserveGift(g.id, one.id)).toBe('reserved')
    expect(await reserveGift(g.id, two.id)).toBe('taken')
    expect(await reserveGift('00000000-0000-4000-8000-000000000000', one.id)).toBe('not_found')
    const [row] = await listGiftsAdmin()
    expect(row.reservedByName).toBe(one.name)
    expect(row.reservedByStatus).toBe('pending')
    expect(row.reservedAt).not.toBeNull()
  })

  it('lets exactly one of many concurrent reserves win', async () => {
    const g = await createGift(base)
    const many = await Promise.all(Array.from({ length: 10 }, () => makeGuest()))
    const results = await Promise.all(many.map((x) => reserveGift(g.id, x.id)))
    expect(results.filter((r) => r === 'reserved')).toHaveLength(1)
    expect(results.filter((r) => r === 'taken')).toHaveLength(9)
    const winner = many[results.indexOf('reserved')]
    const [row] = await db.select().from(gifts).where(eq(gifts.id, g.id))
    expect(row.guestId).toBe(winner.id)
  })

  it('updateGift returns null for an unknown id', async () => {
    expect(await updateGift('00000000-0000-4000-8000-000000000000', base)).toBeNull()
  })

  it('orders by sortOrder within a category', async () => {
    const z = await createGift({ ...base, name: 'Z' })
    const a = await createGift({ ...base, name: 'A' })
    await db.update(gifts).set({ sortOrder: 5 }).where(eq(gifts.id, a.id))
    expect((await listGiftsAdmin()).map((g) => g.id)).toEqual([z.id, a.id])
  })

  it('releases only for the owner', async () => {
    const g = await createGift(base)
    const one = await makeGuest()
    const two = await makeGuest()
    await reserveGift(g.id, one.id)
    expect(await releaseGift(g.id, two.id)).toBe(false)
    expect(await guestHasGift(one.id)).toBe(true)
    expect(await releaseGift(g.id, one.id)).toBe(true)
    expect(await guestHasGift(one.id)).toBe(false)
    expect(await reserveGift(g.id, two.id)).toBe('reserved')
  })

  it('adminReleaseGift frees a reserved gift', async () => {
    const g = await createGift(base)
    const one = await makeGuest()
    await reserveGift(g.id, one.id)
    expect(await adminReleaseGift(g.id)).toBe(true)
    expect(await adminReleaseGift(g.id)).toBe(false)
    const [row] = await db.select().from(gifts).where(eq(gifts.id, g.id))
    expect(row.guestId).toBeNull()
    expect(row.reservedAt).toBeNull()
  })

  it('deletes a reserved gift', async () => {
    const g = await createGift(base)
    await reserveGift(g.id, (await makeGuest()).id)
    expect((await deleteGift(g.id))?.id).toBe(g.id)
  })

  it('sets guest_id to null when the guest is deleted', async () => {
    const g = await createGift(base)
    const one = await makeGuest()
    await reserveGift(g.id, one.id)
    await db.delete(guests).where(eq(guests.id, one.id))
    const [row] = await db.select().from(gifts).where(eq(gifts.id, g.id))
    expect(row.guestId).toBeNull()
  })
})

describe('toGiftViews', () => {
  it('maps states and leaks no guest data', async () => {
    const free = await createGift({ ...base, name: 'free' })
    const mine = await createGift({ ...base, name: 'mine' })
    const taken = await createGift({ ...base, name: 'taken' })
    const me = await makeGuest()
    const other = await makeGuest()
    await reserveGift(mine.id, me.id)
    await reserveGift(taken.id, other.id)
    const rows = await db.select().from(gifts)
    const views = toGiftViews(rows, me.id)
    const state = (id: string) => views.find((v) => v.id === id)?.state
    expect(state(free.id)).toBe('free')
    expect(state(mine.id)).toBe('mine')
    expect(state(taken.id)).toBe('taken')
    for (const v of views) {
      expect(v).not.toHaveProperty('guestId')
      expect(v).not.toHaveProperty('reservedBy')
    }
  })
})

describe('gifts repo: counts and order', () => {
  it('counts reserved and total gifts', async () => {
    expect(await countGifts()).toEqual({ reserved: 0, total: 0 })
    const a = await createGift(base)
    await createGift({ ...base, name: 'Outro' })
    await reserveGift(a.id, (await makeGuest()).id)
    expect(await countGifts()).toEqual({ reserved: 1, total: 2 })
  })

  it('stores and updates the sort order', async () => {
    const g = await createGift({ ...base, sortOrder: 4 })
    expect(g.sortOrder).toBe(4)
    expect((await updateGift(g.id, { ...base, sortOrder: 2 }))?.sortOrder).toBe(2)
  })
})
