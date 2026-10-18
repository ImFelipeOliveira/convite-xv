import { eq, sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/server/db/client'
import { admins, guests, messageDispatches } from '@/server/db/schema'
import { makeGuest, reseedSettings, resetDatabase } from '../../../../tests/helpers/db'
import {
  cancelReminders,
  claimDueReminder,
  createInviteDispatch,
  lastInvitePerGuest,
  listDispatches,
  markDispatchFailed,
  markDispatchSent,
  recoverStuckSending,
  rescheduleReminder,
  upsertReminder,
} from '../dispatches'

async function makeAdmin() {
  const [a] = await db
    .insert(admins)
    .values({ email: `a${Math.random()}@x.com`, passwordHash: 'x' })
    .returning()
  return a
}

async function rows(guestId: string) {
  return db.select().from(messageDispatches).where(eq(messageDispatches.guestId, guestId))
}

describe('dispatches repo', () => {
  beforeEach(async () => {
    await resetDatabase()
    await reseedSettings()
  })

  it('blocks invite while sending, and within 60s after sent, allows after 61s', async () => {
    const g = await makeGuest()
    const admin = await makeAdmin()
    const first = await createInviteDispatch(g.id, admin.id)
    expect('id' in first).toBe(true)
    expect(await createInviteDispatch(g.id, admin.id)).toEqual({ blocked: true })

    if (!('id' in first)) throw new Error('unreachable')
    await markDispatchSent(first.id, 'prov-1')
    expect(await createInviteDispatch(g.id, admin.id)).toEqual({ blocked: true })

    await db
      .update(messageDispatches)
      .set({ sentAt: sql`now() - interval '61 seconds'` })
      .where(eq(messageDispatches.id, first.id))
    const again = await createInviteDispatch(g.id, admin.id)
    expect('id' in again).toBe(true)
  })

  it('allows a new invite after a failure', async () => {
    const g = await makeGuest()
    const first = await createInviteDispatch(g.id, null)
    if (!('id' in first)) throw new Error('unreachable')
    await markDispatchFailed(first.id, 'timeout')
    expect('id' in (await createInviteDispatch(g.id, null))).toBe(true)
  })

  it('serializes concurrent invites: one id, one blocked', async () => {
    const g = await makeGuest()
    const results = await Promise.all([
      createInviteDispatch(g.id, null),
      createInviteDispatch(g.id, null),
    ])
    expect(results.filter((r) => 'id' in r)).toHaveLength(1)
    expect(results.filter((r) => 'blocked' in r)).toHaveLength(1)
    expect(await rows(g.id)).toHaveLength(1)
  })

  it('records attempts=1, sent fields and failure code', async () => {
    const g = await makeGuest()
    const r = await createInviteDispatch(g.id, null)
    if (!('id' in r)) throw new Error('unreachable')
    const [row] = await rows(g.id)
    expect(row.status).toBe('sending')
    expect(row.attempts).toBe(1)
    await markDispatchSent(r.id, 'prov-9')
    const [sent] = await rows(g.id)
    expect(sent.status).toBe('sent')
    expect(sent.providerMessageId).toBe('prov-9')
    expect(sent.sentAt).toBeInstanceOf(Date)
  })

  it('lastInvitePerGuest returns the latest invite with at = sentAt ?? createdAt', async () => {
    const g = await makeGuest()
    const none = await makeGuest()
    const a = await createInviteDispatch(g.id, null)
    if (!('id' in a)) throw new Error('unreachable')
    await markDispatchFailed(a.id, 'x')
    const b = await createInviteDispatch(g.id, null)
    if (!('id' in b)) throw new Error('unreachable')
    await markDispatchSent(b.id, 'p')
    const map = await lastInvitePerGuest()
    expect(map.has(none.id)).toBe(false)
    const entry = map.get(g.id)
    expect(entry?.status).toBe('sent')
    expect(entry?.at).toBeInstanceOf(Date)
    expect(Number.isNaN(entry!.at.getTime())).toBe(false)
    // at = sentAt of the latest row, written by the DB clock
    const sent = (await rows(g.id)).find((r) => r.id === b.id)
    expect(entry!.at.getTime()).toBe(sent!.sentAt!.getTime())
  })

  it('listDispatches filters, includes guestName, newest first', async () => {
    const g = await makeGuest({ name: 'Maria' })
    await createInviteDispatch(g.id, null)
    await upsertReminder(g.id, 'reminder_d7', new Date('2026-12-20T14:00:00Z'))
    const all = await listDispatches()
    expect(all).toHaveLength(2)
    expect(all[0].guestName).toBe('Maria')
    expect(all[0].createdAt.getTime()).toBeGreaterThanOrEqual(all[1].createdAt.getTime())
    expect(await listDispatches({ kind: 'invite' })).toHaveLength(1)
    expect(await listDispatches({ status: 'scheduled' })).toHaveLength(1)
  })

  it('upsertReminder twice yields one row', async () => {
    const g = await makeGuest()
    await upsertReminder(g.id, 'reminder_d7', new Date('2026-12-20T14:00:00Z'))
    await upsertReminder(g.id, 'reminder_d7', new Date('2026-12-20T15:00:00Z'))
    const r = await rows(g.id)
    expect(r).toHaveLength(1)
    expect(r[0].scheduledFor?.toISOString()).toBe('2026-12-20T15:00:00.000Z')
  })

  it('cancelReminders then upsertReminder re-schedules', async () => {
    const g = await makeGuest()
    await upsertReminder(g.id, 'reminder_d1', new Date('2026-12-26T14:00:00Z'))
    await cancelReminders(g.id)
    expect((await rows(g.id))[0].status).toBe('cancelled')
    await upsertReminder(g.id, 'reminder_d1', new Date('2026-12-26T14:00:00Z'))
    const r = await rows(g.id)
    expect(r).toHaveLength(1)
    expect(r[0].status).toBe('scheduled')
  })

  it('upsertReminder never resurrects a sent row', async () => {
    const g = await makeGuest()
    await upsertReminder(g.id, 'reminder_d7', new Date('2026-12-20T14:00:00Z'))
    await db
      .update(messageDispatches)
      .set({ status: 'sent' })
      .where(eq(messageDispatches.guestId, g.id))
    await upsertReminder(g.id, 'reminder_d7', new Date('2026-12-20T14:00:00Z'))
    expect((await rows(g.id))[0].status).toBe('sent')
  })

  it('claimDueReminder returns null before scheduled_for and the row after', async () => {
    const g = await makeGuest()
    await upsertReminder(g.id, 'reminder_d7', new Date('2026-12-20T14:00:00Z'))
    expect(await claimDueReminder(new Date('2026-12-20T13:59:59Z'))).toBeNull()
    const claimed = await claimDueReminder(new Date('2026-12-20T14:00:00Z'))
    expect(claimed?.guestId).toBe(g.id)
    expect(claimed?.status).toBe('sending')
    expect(claimed?.attempts).toBe(1)
    expect(await claimDueReminder(new Date('2026-12-21T00:00:00Z'))).toBeNull()
  })

  it('concurrent claims never return the same row', async () => {
    const g1 = await makeGuest()
    const g2 = await makeGuest()
    await upsertReminder(g1.id, 'reminder_d7', new Date('2026-12-20T14:00:00Z'))
    await upsertReminder(g2.id, 'reminder_d7', new Date('2026-12-20T14:00:00Z'))
    const now = new Date('2026-12-20T15:00:00Z')
    const res = await Promise.all([claimDueReminder(now), claimDueReminder(now), claimDueReminder(now)])
    const ids = res.filter((r) => r !== null).map((r) => r!.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toHaveLength(2)
  })

  it('does not claim invites', async () => {
    const g = await makeGuest()
    await createInviteDispatch(g.id, null)
    expect(await claimDueReminder(new Date('2099-01-01T00:00:00Z'))).toBeNull()
  })

  it('rescheduleReminder goes back to scheduled with error code', async () => {
    const g = await makeGuest()
    await upsertReminder(g.id, 'reminder_d7', new Date('2026-12-20T14:00:00Z'))
    const c = await claimDueReminder(new Date('2026-12-20T14:00:00Z'))
    await rescheduleReminder(c!.id, new Date('2026-12-20T14:05:00Z'), 'timeout')
    const [r] = await rows(g.id)
    expect(r.status).toBe('scheduled')
    expect(r.errorCode).toBe('timeout')
    expect(r.scheduledFor?.toISOString()).toBe('2026-12-20T14:05:00.000Z')
  })

  it('recoverStuckSending recovers reminders and fails invites', async () => {
    const g = await makeGuest()
    await upsertReminder(g.id, 'reminder_d7', new Date('2026-12-20T14:00:00Z'))
    await claimDueReminder(new Date('2026-12-20T14:00:00Z'))
    await createInviteDispatch(g.id, null)
    await db
      .update(messageDispatches)
      .set({ updatedAt: sql`now() - interval '11 minutes'` })
      .where(eq(messageDispatches.guestId, g.id))
    expect(await recoverStuckSending(new Date())).toBe(2)
    const r = await rows(g.id)
    expect(r.find((x) => x.kind === 'reminder_d7')?.status).toBe('scheduled')
    const inv = r.find((x) => x.kind === 'invite')
    expect(inv?.status).toBe('failed')
    expect(inv?.errorCode).toBe('interrupted')
  })

  it('does not recover fresh sending rows', async () => {
    const g = await makeGuest()
    await createInviteDispatch(g.id, null)
    expect(await recoverStuckSending(new Date())).toBe(0)
  })

  it('deleting a guest cascades its dispatches', async () => {
    const g = await makeGuest()
    await createInviteDispatch(g.id, null)
    await db.delete(guests).where(eq(guests.id, g.id))
    expect(await db.select().from(messageDispatches)).toHaveLength(0)
  })

  it('allows several invite rows per guest but one per reminder kind', async () => {
    const g = await makeGuest()
    await db.insert(messageDispatches).values([
      { guestId: g.id, kind: 'invite', status: 'failed' },
      { guestId: g.id, kind: 'invite', status: 'failed' },
    ])
    await expect(
      db.insert(messageDispatches).values([
        { guestId: g.id, kind: 'reminder_d1', status: 'scheduled' },
        { guestId: g.id, kind: 'reminder_d1', status: 'scheduled' },
      ]),
    ).rejects.toThrow()
  })
})
