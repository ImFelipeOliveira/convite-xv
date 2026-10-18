import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/server/db/client'
import { guests, messageDispatches } from '@/server/db/schema'
import { makeGuest } from '../../../../tests/helpers/db'
import { inviteUrl } from '@/features/guests/whatsapp'
import { RSVP_NUDGE_TEXT_DEFAULT } from '@/server/db/schema'
import { renderTemplate } from '../message'
import {
  RSVP_FINAL_TIME,
  REMINDER_TIMES,
  reminderTemplateValues,
  scheduleRsvpNudges,
  syncRemindersForGuest,
} from '../reminders'

// saveGuestAction runs behind the admin guard and revalidates a path: both stubbed here
vi.mock('@/features/admin-auth/guard', () => ({
  requireAdmin: async () => ({ adminId: '00000000-0000-4000-8000-0000000000aa' }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

const PHONE = '+5595991234567'
const DEADLINE = '2026-12-13'

async function rows(guestId: string) {
  return db.select().from(messageDispatches).where(eq(messageDispatches.guestId, guestId))
}

async function scheduled(guestId: string) {
  return (await rows(guestId))
    .filter((r) => r.status === 'scheduled')
    .map((r) => ({ kind: r.kind, at: r.scheduledFor?.toISOString() }))
    .sort((a, b) => a.kind.localeCompare(b.kind))
}

describe('REMINDER_TIMES', () => {
  it('are D-7 and D-1 at 10h in Boa Vista', () => {
    expect(REMINDER_TIMES.reminder_d7.toISOString()).toBe('2026-12-20T14:00:00.000Z')
    expect(REMINDER_TIMES.reminder_d1.toISOString()).toBe('2026-12-26T14:00:00.000Z')
    expect(RSVP_FINAL_TIME.toISOString()).toBe('2026-12-10T14:00:00.000Z')
  })
})

describe('syncRemindersForGuest', () => {
  it('schedules both reminders at the exact times for a yes guest with phone', async () => {
    const g = await makeGuest({ rsvpStatus: 'yes', phone: PHONE })
    await syncRemindersForGuest(g, new Date('2026-11-01T12:00:00Z'))
    expect(await scheduled(g.id)).toEqual([
      { kind: 'reminder_d1', at: '2026-12-26T14:00:00.000Z' },
      { kind: 'reminder_d7', at: '2026-12-20T14:00:00.000Z' },
    ])
  })

  it('schedules nothing for a yes guest without phone', async () => {
    const g = await makeGuest({ rsvpStatus: 'yes', phone: null })
    await syncRemindersForGuest(g, new Date('2026-11-01T12:00:00Z'))
    expect(await rows(g.id)).toHaveLength(0)
  })

  it('only schedules D-1 once D-7 has passed', async () => {
    const g = await makeGuest({ rsvpStatus: 'yes', phone: PHONE })
    await syncRemindersForGuest(g, new Date('2026-12-22T00:00:00Z'))
    expect(await scheduled(g.id)).toEqual([{ kind: 'reminder_d1', at: '2026-12-26T14:00:00.000Z' }])
  })

  it('schedules nothing after D-1', async () => {
    const g = await makeGuest({ rsvpStatus: 'yes', phone: PHONE })
    await syncRemindersForGuest(g, new Date('2026-12-26T14:00:01Z'))
    expect(await rows(g.id)).toHaveLength(0)
  })

  it('cancels confirmed-guest reminders when the guest is no longer yes', async () => {
    const g = await makeGuest({ rsvpStatus: 'yes', phone: PHONE })
    await syncRemindersForGuest(g, new Date('2026-11-01T12:00:00Z'))
    await syncRemindersForGuest({ ...g, rsvpStatus: 'no' }, new Date('2026-11-02T12:00:00Z'))
    const all = await rows(g.id)
    expect(all).toHaveLength(2)
    expect(all.every((r) => r.status === 'cancelled')).toBe(true)
  })

  it('cancels reminders when the phone is removed', async () => {
    const g = await makeGuest({ rsvpStatus: 'yes', phone: PHONE })
    await syncRemindersForGuest(g, new Date('2026-11-01T12:00:00Z'))
    await syncRemindersForGuest({ ...g, phone: null }, new Date('2026-11-02T12:00:00Z'))
    expect(await scheduled(g.id)).toEqual([])
  })

  it('any answer cancels the rsvp nudges; a pending guest keeps them', async () => {
    const g = await makeGuest({ phone: PHONE })
    await scheduleRsvpNudges(g, new Date('2026-11-01T12:00:00Z'), DEADLINE)
    await syncRemindersForGuest(g, new Date('2026-11-02T12:00:00Z'))
    expect((await scheduled(g.id)).map((r) => r.kind)).toEqual(['rsvp_final', 'rsvp_nudge'])

    await syncRemindersForGuest({ ...g, rsvpStatus: 'no' }, new Date('2026-11-02T12:00:00Z'))
    const nudges = (await rows(g.id)).filter((r) => r.kind === 'rsvp_nudge' || r.kind === 'rsvp_final')
    expect(nudges.map((r) => r.status)).toEqual(['cancelled', 'cancelled'])
  })

  it('a yes answer cancels the nudges and schedules the reminders', async () => {
    const g = await makeGuest({ phone: PHONE })
    await scheduleRsvpNudges(g, new Date('2026-11-01T12:00:00Z'), DEADLINE)
    await syncRemindersForGuest({ ...g, rsvpStatus: 'yes' }, new Date('2026-11-03T12:00:00Z'))
    expect((await scheduled(g.id)).map((r) => r.kind)).toEqual(['reminder_d1', 'reminder_d7'])
  })
})

describe('scheduleRsvpNudges', () => {
  it('schedules the nudge exactly 5 days after the invite and the final notice on 10/12', async () => {
    const g = await makeGuest({ phone: PHONE })
    await scheduleRsvpNudges(g, new Date('2026-11-01T12:34:56.789Z'), DEADLINE)
    expect(await scheduled(g.id)).toEqual([
      { kind: 'rsvp_final', at: '2026-12-10T14:00:00.000Z' },
      { kind: 'rsvp_nudge', at: '2026-11-06T12:34:56.789Z' },
    ])
  })

  it('skips the nudge when it would land after the day before the deadline', async () => {
    const g = await makeGuest({ phone: PHONE })
    // deadline 13/12 → cutoff 12/12 (start of the deadline day in Boa Vista = 13/12 04:00Z)
    await scheduleRsvpNudges(g, new Date('2026-12-08T04:00:01Z'), DEADLINE)
    expect((await scheduled(g.id)).map((r) => r.kind)).toEqual(['rsvp_final'])
  })

  it('keeps the nudge when it lands exactly on the cutoff', async () => {
    const g = await makeGuest({ phone: PHONE })
    await scheduleRsvpNudges(g, new Date('2026-12-08T04:00:00Z'), DEADLINE)
    expect((await scheduled(g.id)).map((r) => r.kind)).toEqual(['rsvp_final', 'rsvp_nudge'])
  })

  it('skips the final notice once its time has passed', async () => {
    const g = await makeGuest({ phone: PHONE })
    await scheduleRsvpNudges(g, new Date('2026-12-10T14:00:00Z'), '2026-12-26')
    expect(await scheduled(g.id)).toEqual([{ kind: 'rsvp_nudge', at: '2026-12-15T14:00:00.000Z' }])
  })

  it('schedules nothing for a guest who already answered', async () => {
    const g = await makeGuest({ phone: PHONE, rsvpStatus: 'yes' })
    await scheduleRsvpNudges(g, new Date('2026-11-01T12:00:00Z'), DEADLINE)
    expect(await rows(g.id)).toHaveLength(0)
  })

  it('a resend keeps one nudge and never resurrects a sent one', async () => {
    const g = await makeGuest({ phone: PHONE })
    await scheduleRsvpNudges(g, new Date('2026-11-01T12:00:00Z'), DEADLINE)
    await scheduleRsvpNudges(g, new Date('2026-11-02T12:00:00Z'), DEADLINE)
    let nudges = (await rows(g.id)).filter((r) => r.kind === 'rsvp_nudge')
    expect(nudges).toHaveLength(1)

    await db
      .update(messageDispatches)
      .set({ status: 'sent', sentAt: new Date('2026-11-07T12:00:00Z') })
      .where(eq(messageDispatches.id, nudges[0].id))
    await scheduleRsvpNudges(g, new Date('2026-11-08T12:00:00Z'), DEADLINE)
    nudges = (await rows(g.id)).filter((r) => r.kind === 'rsvp_nudge')
    expect(nudges).toHaveLength(1)
    expect(nudges[0].status).toBe('sent')
  })
})

describe('saveGuestAction', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-01T12:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('adding a phone to a yes guest schedules the reminders', async () => {
    const { saveGuestAction } = await import('@/features/guests/actions')
    const g = await makeGuest({ name: 'Ana Souza', rsvpStatus: 'yes', phone: null, plusOnesLimit: 1 })
    expect(await rows(g.id)).toHaveLength(0)

    const fd = new FormData()
    fd.set('id', g.id)
    fd.set('name', 'Ana Souza')
    fd.set('phone', '(95) 99123-4567')
    fd.set('plusOnesLimit', '1')
    const r = await saveGuestAction(null, fd)

    expect(r).toEqual({ ok: true, message: 'Convidado atualizado.' })
    const [row] = await db.select().from(guests).where(eq(guests.id, g.id))
    expect(row.phone).toBe(PHONE)
    expect((await scheduled(g.id)).map((r) => r.kind)).toEqual(['reminder_d1', 'reminder_d7'])
  })

  it('editing a pending guest schedules nothing', async () => {
    const { saveGuestAction } = await import('@/features/guests/actions')
    const g = await makeGuest({ name: 'Bia', phone: null, plusOnesLimit: 0 })
    const fd = new FormData()
    fd.set('id', g.id)
    fd.set('name', 'Bia')
    fd.set('phone', '(95) 99123-4567')
    fd.set('plusOnesLimit', '0')
    expect((await saveGuestAction(null, fd))?.ok).toBe(true)
    expect(await rows(g.id)).toHaveLength(0)
  })
})

describe('reminderTemplateValues', () => {
  const settings = { rsvpDeadline: '2026-12-13', rsvpPreferredDate: '2026-11-21' }
  const guest = { name: 'Ana Souza', token: 'TOKEN0000000000000000A' }

  it('renders the active preferred date in {preferencia}', () => {
    const v = reminderTemplateValues(settings, guest, new Date('2026-11-06T14:00:00Z'))
    expect(v).toEqual({ name: 'Ana Souza', link: inviteUrl(guest.token), deadline: '2026-12-13', preferredDate: '2026-11-21' })
    expect(renderTemplate(RSVP_NUDGE_TEXT_DEFAULT, v)).toContain('responda até 21/11 pelo seu convite')
  })

  it('falls back to the deadline once the preferred date has passed', () => {
    const v = reminderTemplateValues(settings, guest, new Date('2026-11-22T04:00:00Z'))
    expect(renderTemplate(RSVP_NUDGE_TEXT_DEFAULT, v)).toBe(
      `Oi, Ana! Ainda não recebemos sua confirmação para os 15 anos da Isabella. Se puder, responda até 13/12 pelo seu convite: ${inviteUrl(guest.token)}`,
    )
  })

  it('falls back to the deadline without a preferred date', () => {
    const v = reminderTemplateValues({ ...settings, rsvpPreferredDate: null }, guest, new Date('2026-11-06T14:00:00Z'))
    expect(renderTemplate('{preferencia} {prazo}', v)).toBe('13/12 13/12')
  })
})
