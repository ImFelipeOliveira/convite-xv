import { eq, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { logger } from '@/lib/logger'
import { inviteUrl } from '@/features/guests/whatsapp'
import { db } from '@/server/db/client'
import { gifts, guests, messageDispatches, settings, type DispatchKind } from '@/server/db/schema'
import { createGift } from '@/features/gifts/repo'
import { makeGuest } from '../../../../tests/helpers/db'
import type { EvolutionConfig } from '../config'
import * as dispatches from '../dispatches'
import { dbNow, retryFailedReminder } from '../dispatches'
import {
  greetingSeed,
  resetDispatcherForTests,
  runDispatcherTick,
  staleReason,
  startDispatcher,
  type DispatcherDeps,
} from '../dispatcher'
import type { EvolutionError, EvolutionResult } from '../evolution'
import { varyGreeting } from '../message'

const CFG: EvolutionConfig = { url: 'http://evolution.test', apiKey: 'k', instance: 'convite-xv' }
const PHONE = '+5595991234567'
const MIN = 60 * 1000
/** 11:00 in Boa Vista, before every deadline/reminder/event: the dispatcher's clock in most tests. */
const DAY = new Date('2026-11-16T15:00:00Z')

type SendResult = EvolutionResult<{ messageId: string | null }>

function makeDeps(
  now: Date,
  opts: {
    send?: (n: number) => SendResult
    state?: EvolutionResult<'open' | 'connecting' | 'close'>
    cfg?: EvolutionConfig | null
    random?: number
    onSleep?: (n: number) => Promise<void>
  } = {},
) {
  let n = 0
  const sleeps: number[] = []
  const deps = {
    now: () => now,
    sleep: vi.fn(async (ms: number) => {
      sleeps.push(ms)
      await opts.onSleep?.(sleeps.length)
    }),
    random: () => opts.random ?? 0.5,
    sendText: vi.fn<DispatcherDeps['sendText']>(async () => {
      n++
      return opts.send ? opts.send(n) : { ok: true, value: { messageId: `MSG-${n}` } }
    }),
    getConnectionState: vi.fn<DispatcherDeps['getConnectionState']>(
      async () => opts.state ?? { ok: true, value: 'open' },
    ),
    readEvolutionConfig: vi.fn(() => (opts.cfg === undefined ? CFG : opts.cfg)),
  } satisfies DispatcherDeps
  return { deps, sleeps }
}

const fail = (error: EvolutionError): SendResult => ({ ok: false, error })

async function makeReminder(
  guestId: string,
  kind: DispatchKind,
  scheduledFor: Date,
  extra: Partial<typeof messageDispatches.$inferInsert> = {},
) {
  const [row] = await db
    .insert(messageDispatches)
    .values({ guestId, kind, status: 'scheduled', scheduledFor, ...extra })
    .returning()
  return row
}

async function row(id: string) {
  const [r] = await db.select().from(messageDispatches).where(eq(messageDispatches.id, id))
  return r
}

beforeEach(() => resetDispatcherForTests())
afterEach(() => {
  resetDispatcherForTests()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('runDispatcherTick', () => {
  it('sends two due reminders in order with one 20–60 s pause between them', async () => {
    const now = DAY
    const base = await dbNow()
    const a = await makeGuest({ name: 'Ana Souza', rsvpStatus: 'yes', phone: PHONE })
    const b = await makeGuest({ name: 'Bruno Lima', rsvpStatus: 'yes', phone: '+5595990000001' })
    const r1 = await makeReminder(a.id, 'reminder_d7', new Date(base.getTime() - 2 * MIN))
    const r2 = await makeReminder(b.id, 'reminder_d7', new Date(base.getTime() - 1 * MIN))
    const { deps, sleeps } = makeDeps(now, { random: 0.25 })

    const res = await runDispatcherTick(deps)

    expect(res).toEqual({ sent: 2, failed: 0, skipped: null })
    expect(deps.sendText.mock.calls.map((c) => c[1].phoneE164)).toEqual([PHONE, '+5595990000001'])
    // a pause follows each send, before the next claim (the last one finds nothing due)
    expect(sleeps).toEqual([30_000, 30_000])
    const s1 = await row(r1.id)
    const s2 = await row(r2.id)
    expect([s1.status, s1.providerMessageId]).toEqual(['sent', 'MSG-1'])
    expect([s2.status, s2.providerMessageId]).toEqual(['sent', 'MSG-2'])
    expect(s1.sentAt).not.toBeNull()
  })

  it('pauses with 20–60 s between sends', async () => {
    const now = DAY
    const base = await dbNow()
    for (const r of [0, 0.999]) {
      const g = await makeGuest({ rsvpStatus: 'yes', phone: PHONE })
      await makeReminder(g.id, 'reminder_d7', new Date(base.getTime() - MIN))
      const { deps, sleeps } = makeDeps(now, { random: r })
      await runDispatcherTick(deps)
      expect(sleeps[0]).toBeGreaterThanOrEqual(20_000)
      expect(sleeps[0]).toBeLessThanOrEqual(60_000)
    }
  })

  it('cancels the next row when its guest answers during the pause (checked right before sending)', async () => {
    const now = DAY
    const base = await dbNow()
    const a = await makeGuest({ rsvpStatus: 'yes', phone: PHONE })
    const b = await makeGuest({ rsvpStatus: 'yes', phone: PHONE })
    const r1 = await makeReminder(a.id, 'reminder_d7', new Date(base.getTime() - 2 * MIN))
    const r2 = await makeReminder(b.id, 'reminder_d7', new Date(base.getTime() - MIN))
    const { deps } = makeDeps(now, {
      onSleep: async (n) => {
        if (n === 1) await db.update(guests).set({ rsvpStatus: 'no' }).where(eq(guests.id, b.id))
      },
    })

    expect(await runDispatcherTick(deps)).toEqual({ sent: 1, failed: 0, skipped: null })
    expect(deps.sendText).toHaveBeenCalledTimes(1)
    expect((await row(r1.id)).status).toBe('sent')
    expect((await row(r2.id)).status).toBe('cancelled')
  })

  it('leaves the row sending (never rescheduled) when recording a successful send fails', async () => {
    const now = DAY
    const base = await dbNow()
    const g = await makeGuest({ rsvpStatus: 'yes', phone: PHONE })
    const r = await makeReminder(g.id, 'reminder_d7', new Date(base.getTime() - MIN))
    vi.spyOn(dispatches, 'markDispatchSent').mockRejectedValue(new Error('db down'))
    const log = vi.spyOn(logger, 'error').mockImplementation(() => {})
    const { deps } = makeDeps(now)

    await expect(runDispatcherTick(deps)).rejects.toThrow('db down')
    expect(deps.sendText).toHaveBeenCalledTimes(1)
    const s = await row(r.id)
    expect([s.status, s.attempts]).toEqual(['sending', 1])
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'whatsapp.dispatcher_error', dispatchId: r.id }),
      expect.any(String),
    )
  })

  it('logs dispatcher_paused once per state change', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    const now = DAY
    const close = makeDeps(now, { state: { ok: true, value: 'close' } }).deps
    await runDispatcherTick(close)
    await runDispatcherTick(close)
    await runDispatcherTick(makeDeps(now, { state: { ok: true, value: 'connecting' } }).deps)
    const paused = warn.mock.calls.filter((c) => (c[0] as { event?: string }).event === 'whatsapp.dispatcher_paused')
    expect(paused.map((c) => (c[0] as { state: string }).state)).toEqual(['close', 'connecting'])
  })

  it('renders the settings template with first name, invite link and a seeded greeting', async () => {
    const now = DAY
    const base = await dbNow()
    await db
      .update(settings)
      .set({ reminderD1Text: 'Olá, {nome}! Amanhã é o dia. {link}' })
      .where(eq(settings.id, 1))
    const g = await makeGuest({ name: 'Carla Maria Dias', rsvpStatus: 'yes', phone: PHONE })
    await makeReminder(g.id, 'reminder_d1', new Date(base.getTime() - MIN))
    const { deps } = makeDeps(now)

    await runDispatcherTick(deps)

    const expected = `Olá, Carla! Amanhã é o dia. ${inviteUrl(g.token)}`
    expect(deps.sendText.mock.calls[0][1].text).toBe(varyGreeting(expected, greetingSeed(g.id, 1)))
  })

  it('varies the greeting between attempts of the same reminder', () => {
    const id = '00000000-0000-4000-8000-000000000001'
    const text = 'Olá, Ana!'
    const variants = new Set([1, 2, 3].map((a) => varyGreeting(text, greetingSeed(id, a))))
    expect(variants.size).toBe(3)
  })

  it('reschedules a provider error on the first attempt +5 min, then +15 min, and fails the third', async () => {
    const now = DAY
    const base = await dbNow()
    const g = await makeGuest({ rsvpStatus: 'yes', phone: PHONE })
    const r = await makeReminder(g.id, 'reminder_d7', new Date(base.getTime() - MIN))
    const { deps } = makeDeps(now, { send: () => fail('provider_error') })
    // the retry time comes from the dispatcher clock; make it due again by the DB clock
    const makeDue = () =>
      db.update(messageDispatches).set({ scheduledFor: sql`now() - interval '1 second'` }).where(eq(messageDispatches.id, r.id))

    expect(await runDispatcherTick(deps)).toEqual({ sent: 0, failed: 1, skipped: null })
    let s = await row(r.id)
    expect(s.status).toBe('scheduled')
    expect(s.attempts).toBe(1)
    expect(s.errorCode).toBe('provider_error')
    expect(s.scheduledFor?.getTime()).toBe(now.getTime() + 5 * MIN)

    await makeDue()
    const later = new Date(now.getTime() + 5 * MIN)
    await runDispatcherTick(makeDeps(later, { send: () => fail('provider_error') }).deps)
    s = await row(r.id)
    expect([s.status, s.attempts]).toEqual(['scheduled', 2])
    expect(s.scheduledFor?.getTime()).toBe(later.getTime() + 15 * MIN)

    await makeDue()
    const last = new Date(later.getTime() + 15 * MIN)
    await runDispatcherTick(makeDeps(last, { send: () => fail('provider_error') }).deps)
    s = await row(r.id)
    expect([s.status, s.attempts, s.errorCode]).toEqual(['failed', 3, 'provider_error'])
  })

  it('fails a timeout at once (the message may have gone out: no automatic retry)', async () => {
    const base = await dbNow()
    const g = await makeGuest({ rsvpStatus: 'yes', phone: PHONE })
    const r = await makeReminder(g.id, 'reminder_d7', new Date(base.getTime() - MIN))
    const { deps } = makeDeps(DAY, { send: () => fail('timeout') })

    expect(await runDispatcherTick(deps)).toEqual({ sent: 0, failed: 1, skipped: null })
    const s = await row(r.id)
    expect([s.status, s.attempts, s.errorCode]).toEqual(['failed', 1, 'timeout'])
  })

  it('does not claim anything when the instance is not open', async () => {
    const now = DAY
    const base = await dbNow()
    const g = await makeGuest({ rsvpStatus: 'yes', phone: PHONE })
    const r = await makeReminder(g.id, 'reminder_d7', new Date(base.getTime() - MIN))
    const { deps } = makeDeps(now, { state: { ok: true, value: 'close' } })

    expect(await runDispatcherTick(deps)).toEqual({ sent: 0, failed: 0, skipped: 'not_connected' })
    expect(deps.sendText).not.toHaveBeenCalled()
    const s = await row(r.id)
    expect([s.status, s.attempts]).toEqual(['scheduled', 0])
    expect(s.updatedAt.getTime()).toBe(r.updatedAt.getTime())
  })

  it('stops the tick on not_connected and reschedules +5 min without consuming an attempt', async () => {
    const now = DAY
    const base = await dbNow()
    const a = await makeGuest({ rsvpStatus: 'yes', phone: PHONE })
    const b = await makeGuest({ rsvpStatus: 'yes', phone: PHONE })
    const r1 = await makeReminder(a.id, 'reminder_d7', new Date(base.getTime() - 2 * MIN))
    const r2 = await makeReminder(b.id, 'reminder_d7', new Date(base.getTime() - MIN))
    const { deps } = makeDeps(now, { send: () => fail('not_connected') })

    expect(await runDispatcherTick(deps)).toEqual({ sent: 0, failed: 0, skipped: 'not_connected' })
    expect(deps.sendText).toHaveBeenCalledTimes(1)
    const s1 = await row(r1.id)
    expect([s1.status, s1.attempts, s1.errorCode]).toEqual(['scheduled', 0, 'not_connected'])
    expect(s1.scheduledFor?.getTime()).toBe(now.getTime() + 5 * MIN)
    expect((await row(r2.id)).status).toBe('scheduled')
  })

  it('cancels a reminder whose guest switched to no, sending nothing', async () => {
    const now = DAY
    const base = await dbNow()
    const g = await makeGuest({ rsvpStatus: 'yes', phone: PHONE })
    const r = await makeReminder(g.id, 'reminder_d7', new Date(base.getTime() - MIN))
    await db.update(guests).set({ rsvpStatus: 'no' }).where(eq(guests.id, g.id))
    const { deps, sleeps } = makeDeps(now)

    expect(await runDispatcherTick(deps)).toEqual({ sent: 0, failed: 0, skipped: null })
    expect(deps.sendText).not.toHaveBeenCalled()
    expect(sleeps).toEqual([])
    expect((await row(r.id)).status).toBe('cancelled')
  })

  it('cancels a reminder for a guest without phone', async () => {
    const now = DAY
    const base = await dbNow()
    const g = await makeGuest({ rsvpStatus: 'yes', phone: null })
    const r = await makeReminder(g.id, 'reminder_d1', new Date(base.getTime() - MIN))
    const { deps } = makeDeps(now)
    await runDispatcherTick(deps)
    expect(deps.sendText).not.toHaveBeenCalled()
    expect((await row(r.id)).status).toBe('cancelled')
  })

  it('recovers a sending row stuck for 11 min and sends it in the same tick', async () => {
    const now = DAY
    const base = await dbNow()
    const g = await makeGuest({ rsvpStatus: 'yes', phone: PHONE })
    const r = await makeReminder(g.id, 'reminder_d1', new Date(base.getTime() - 20 * MIN), {
      status: 'sending',
      attempts: 1,
    })
    await db
      .update(messageDispatches)
      .set({ updatedAt: new Date(base.getTime() - 11 * MIN) })
      .where(eq(messageDispatches.id, r.id))
    const { deps } = makeDeps(now)

    expect(await runDispatcherTick(deps)).toEqual({ sent: 1, failed: 0, skipped: null })
    const s = await row(r.id)
    expect([s.status, s.attempts]).toEqual(['sent', 2])
  })

  it('fails a recovered row that already used its 3 attempts without sending again', async () => {
    const now = DAY
    const base = await dbNow()
    const g = await makeGuest({ rsvpStatus: 'yes', phone: PHONE })
    const r = await makeReminder(g.id, 'reminder_d1', new Date(base.getTime() - 30 * MIN), {
      status: 'sending',
      attempts: 3,
    })
    await db
      .update(messageDispatches)
      .set({ updatedAt: new Date(base.getTime() - 11 * MIN) })
      .where(eq(messageDispatches.id, r.id))
    const { deps } = makeDeps(now)

    await runDispatcherTick(deps)
    expect(deps.sendText).not.toHaveBeenCalled()
    const s = await row(r.id)
    expect([s.status, s.attempts, s.errorCode]).toEqual(['failed', 3, 'interrupted'])
  })

  it('picks up a failed reminder re-armed by retryFailedReminder on the next tick', async () => {
    const g = await makeGuest({ rsvpStatus: 'yes', phone: PHONE })
    const r = await makeReminder(g.id, 'reminder_d7', new Date(Date.now() - 60 * MIN), {
      status: 'failed',
      attempts: 3,
      errorCode: 'timeout',
    })
    expect(await retryFailedReminder(r.id)).toBe(true)
    const { deps } = makeDeps(DAY)

    expect(await runDispatcherTick(deps)).toEqual({ sent: 1, failed: 0, skipped: null })
    expect([(await row(r.id)).status, (await row(r.id)).attempts]).toEqual(['sent', 1])
  })

  it('skips when Evolution is not configured', async () => {
    const now = DAY
    const { deps } = makeDeps(now, { cfg: null })
    expect(await runDispatcherTick(deps)).toEqual({ sent: 0, failed: 0, skipped: 'not_configured' })
    expect(deps.getConnectionState).not.toHaveBeenCalled()
  })

  it('caps a tick at 30 sends', async () => {
    const now = DAY
    const base = await dbNow()
    for (let i = 0; i < 31; i++) {
      const g = await makeGuest({ rsvpStatus: 'yes', phone: PHONE })
      await makeReminder(g.id, 'reminder_d7', new Date(base.getTime() - (40 - i) * MIN))
    }
    const { deps, sleeps } = makeDeps(now)
    expect(await runDispatcherTick(deps)).toEqual({ sent: 30, failed: 0, skipped: null })
    expect(sleeps).toHaveLength(29)
    expect(deps.sendText).toHaveBeenCalledTimes(30)
    const [{ left }] = await db.execute<{ left: number }>(
      sql`SELECT count(*)::int AS left FROM message_dispatches WHERE status = 'scheduled'`,
    )
    expect(left).toBe(1)
  })
})

describe('runDispatcherTick — rsvp nudges', () => {
  it('sends the nudge text (preferred date) to a guest still pending', async () => {
    const now = DAY
    const base = await dbNow()
    await db
      .update(settings)
      .set({ rsvpDeadline: '2099-12-31', rsvpPreferredDate: '2099-11-21' })
      .where(eq(settings.id, 1))
    const g = await makeGuest({ name: 'Davi Rocha', rsvpStatus: 'pending', phone: PHONE })
    const r = await makeReminder(g.id, 'rsvp_nudge', new Date(base.getTime() - MIN))
    const { deps } = makeDeps(now)

    expect(await runDispatcherTick(deps)).toEqual({ sent: 1, failed: 0, skipped: null })
    expect(deps.sendText.mock.calls[0][1].text).toBe(
      `Oi, Davi! Ainda não recebemos sua confirmação para os 15 anos da Isabella. Se puder, responda até 21/11 pelo seu convite: ${inviteUrl(g.token)}`,
    )
    expect((await row(r.id)).status).toBe('sent')
  })

  it('sends the final notice with the deadline', async () => {
    const now = DAY
    const base = await dbNow()
    const g = await makeGuest({ name: 'Eva Melo', rsvpStatus: 'pending', phone: PHONE })
    await makeReminder(g.id, 'rsvp_final', new Date(base.getTime() - MIN))
    const { deps } = makeDeps(now)
    await runDispatcherTick(deps)
    expect(deps.sendText.mock.calls[0][1].text).toBe(
      `Oi, Eva! O prazo para confirmar presença nos 15 anos da Isabella termina em 13/12. Responda pelo seu convite: ${inviteUrl(g.token)}`,
    )
  })

  it('cancels a nudge for a guest who answered meanwhile', async () => {
    const now = DAY
    const base = await dbNow()
    const g = await makeGuest({ rsvpStatus: 'pending', phone: PHONE })
    const r1 = await makeReminder(g.id, 'rsvp_nudge', new Date(base.getTime() - MIN))
    await db.update(guests).set({ rsvpStatus: 'yes' }).where(eq(guests.id, g.id))
    const { deps } = makeDeps(now)

    await runDispatcherTick(deps)
    expect(deps.sendText).not.toHaveBeenCalled()
    expect((await row(r1.id)).status).toBe('cancelled')
  })
})

describe('runDispatcherTick — send-time guards', () => {
  async function due(kind: DispatchKind, rsvpStatus: 'yes' | 'pending') {
    const base = await dbNow()
    const g = await makeGuest({ rsvpStatus, phone: PHONE })
    return makeReminder(g.id, kind, new Date(base.getTime() - MIN))
  }

  it.each([
    ['rsvp_nudge', '2026-12-14T13:00:00Z'],
    ['rsvp_final', '2026-12-14T13:00:00Z'],
  ] as const)('cancels %s once the deadline has passed (deadline_passed)', async (kind, at) => {
    const r = await due(kind, 'pending')
    const { deps } = makeDeps(new Date(at))
    expect(await runDispatcherTick(deps)).toEqual({ sent: 0, failed: 0, skipped: null })
    expect(deps.sendText).not.toHaveBeenCalled()
    const s = await row(r.id)
    expect([s.status, s.errorCode]).toEqual(['cancelled', 'deadline_passed'])
  })

  it('still sends rsvp_final on the last day of the deadline', async () => {
    const r = await due('rsvp_final', 'pending')
    const { deps } = makeDeps(new Date('2026-12-13T23:00:00Z')) // 19:00 on 13/12 in Boa Vista
    expect(await runDispatcherTick(deps)).toEqual({ sent: 1, failed: 0, skipped: null })
    expect((await row(r.id)).status).toBe('sent')
  })

  it('cancels a D-7 reminder once the D-1 time has come (stale)', async () => {
    const r = await due('reminder_d7', 'yes')
    const { deps } = makeDeps(new Date('2026-12-26T14:00:00Z'))
    await runDispatcherTick(deps)
    expect(deps.sendText).not.toHaveBeenCalled()
    const s = await row(r.id)
    expect([s.status, s.errorCode]).toEqual(['cancelled', 'stale'])
  })

  it('sends a D-7 reminder just before the D-1 time', async () => {
    const r = await due('reminder_d7', 'yes')
    const { deps } = makeDeps(new Date('2026-12-26T13:59:00Z'))
    await runDispatcherTick(deps)
    expect((await row(r.id)).status).toBe('sent')
  })

  it('cancels any kind once the party has started (after_event)', async () => {
    const r = await due('reminder_d1', 'yes')
    const { deps } = makeDeps(new Date('2026-12-27T14:00:00Z'))
    await runDispatcherTick(deps)
    expect(deps.sendText).not.toHaveBeenCalled()
    const s = await row(r.id)
    expect([s.status, s.errorCode]).toEqual(['cancelled', 'after_event'])
  })
})

describe('runDispatcherTick — quiet hours (09:00–20:00 Boa Vista)', () => {
  async function dueRow() {
    const base = await dbNow()
    const g = await makeGuest({ rsvpStatus: 'yes', phone: PHONE })
    return makeReminder(g.id, 'reminder_d7', new Date(base.getTime() - MIN), { attempts: 1 })
  }

  it.each([
    ['08:59 → 09:00 the same day', '2026-11-16T12:59:00Z', '2026-11-16T13:00:00.000Z'],
    ['20:00 → 09:00 the next day', '2026-11-17T00:00:00Z', '2026-11-17T13:00:00.000Z'],
    ['23:00 → 09:00 the next day', '2026-11-17T03:00:00Z', '2026-11-17T13:00:00.000Z'],
  ])('defers due reminders outside the window (%s) without consuming an attempt', async (_, at, next) => {
    const r = await dueRow()
    const { deps } = makeDeps(new Date(at))
    expect(await runDispatcherTick(deps)).toEqual({ sent: 0, failed: 0, skipped: 'quiet_hours' })
    expect(deps.sendText).not.toHaveBeenCalled()
    expect(deps.getConnectionState).not.toHaveBeenCalled()
    const s = await row(r.id)
    expect([s.status, s.attempts, s.scheduledFor?.toISOString()]).toEqual(['scheduled', 1, next])
  })

  it.each([
    ['09:00', '2026-11-16T13:00:00Z'],
    ['19:59', '2026-11-16T23:59:00Z'],
  ])('sends inside the window (%s)', async (_, at) => {
    const r = await dueRow()
    const { deps } = makeDeps(new Date(at))
    expect(await runDispatcherTick(deps)).toEqual({ sent: 1, failed: 0, skipped: null })
    expect((await row(r.id)).status).toBe('sent')
  })

  it('stops a tick that reaches 20:00 between sends and defers the rest', async () => {
    const base = await dbNow()
    const a = await makeGuest({ rsvpStatus: 'yes', phone: PHONE })
    const b = await makeGuest({ rsvpStatus: 'yes', phone: PHONE })
    const r1 = await makeReminder(a.id, 'reminder_d7', new Date(base.getTime() - 2 * MIN))
    const r2 = await makeReminder(b.id, 'reminder_d7', new Date(base.getTime() - MIN))
    let clock = new Date('2026-11-16T23:59:30Z')
    const { deps } = makeDeps(clock)
    deps.now = () => clock
    deps.sleep.mockImplementation(async () => {
      clock = new Date('2026-11-17T00:00:10Z')
    })

    expect(await runDispatcherTick(deps)).toEqual({ sent: 1, failed: 0, skipped: 'quiet_hours' })
    expect((await row(r1.id)).status).toBe('sent')
    const s2 = await row(r2.id)
    expect([s2.status, s2.scheduledFor?.toISOString()]).toEqual(['scheduled', '2026-11-17T13:00:00.000Z'])
  })

  it('recovers stuck rows even when not configured or disconnected', async () => {
    const base = await dbNow()
    const g = await makeGuest({ rsvpStatus: 'yes', phone: PHONE })
    const inv = await makeReminder(g.id, 'invite', new Date(base.getTime() - 20 * MIN), { status: 'sending', attempts: 1 })
    await db
      .update(messageDispatches)
      .set({ updatedAt: sql`now() - interval '11 minutes'` })
      .where(eq(messageDispatches.id, inv.id))
    await runDispatcherTick(makeDeps(DAY, { cfg: null }).deps)
    const s = await row(inv.id)
    expect([s.status, s.errorCode]).toEqual(['failed', 'interrupted'])
  })
})

describe('runDispatcherTick — D-1 on the event day', () => {
  it('staleReason: D-1 is stale from 00:00 Boa Vista on 27/12 (event_day)', () => {
    const s = { rsvpDeadline: '2026-12-13' }
    expect(staleReason('reminder_d1', s, new Date('2026-12-27T03:59:59Z'))).toBeNull()
    expect(staleReason('reminder_d1', s, new Date('2026-12-27T04:00:00Z'))).toBe('event_day')
  })

  it('cancels a deferred D-1 on the party morning instead of saying "amanhã"', async () => {
    const base = await dbNow()
    const g = await makeGuest({ rsvpStatus: 'yes', phone: PHONE })
    const r = await makeReminder(g.id, 'reminder_d1', new Date(base.getTime() - MIN))
    const { deps } = makeDeps(new Date('2026-12-27T13:00:00Z')) // 09:00 on 27/12 in Boa Vista
    expect(await runDispatcherTick(deps)).toEqual({ sent: 0, failed: 0, skipped: null })
    expect(deps.sendText).not.toHaveBeenCalled()
    const s = await row(r.id)
    expect([s.status, s.errorCode]).toEqual(['cancelled', 'event_day'])
  })

  it('still sends D-1 on the evening of 26/12', async () => {
    const base = await dbNow()
    const g = await makeGuest({ rsvpStatus: 'yes', phone: PHONE })
    const r = await makeReminder(g.id, 'reminder_d1', new Date(base.getTime() - MIN))
    const { deps } = makeDeps(new Date('2026-12-26T23:30:00Z')) // 19:30 on 26/12
    expect(await runDispatcherTick(deps)).toEqual({ sent: 1, failed: 0, skipped: null })
    expect((await row(r.id)).status).toBe('sent')
  })
})

describe('runDispatcherTick — gift messages', () => {
  beforeEach(() => vi.stubEnv('FEATURES', 'gifts'))
  afterEach(() => vi.unstubAllEnvs())

  async function dueGift(kind: 'gift_list' | 'gift_nudge', over: Partial<typeof guests.$inferInsert> = {}) {
    const base = await dbNow()
    const g = await makeGuest({ name: 'Lia Prado', rsvpStatus: 'yes', phone: PHONE, ...over })
    const r = await makeReminder(g.id, kind, new Date(base.getTime() - MIN))
    return { g, r }
  }

  it('sends the gift list with the gifts-anchor link', async () => {
    const { g, r } = await dueGift('gift_list')
    const { deps } = makeDeps(DAY)
    expect(await runDispatcherTick(deps)).toEqual({ sent: 1, failed: 0, skipped: null })
    expect(deps.sendText.mock.calls[0][1].text).toBe(
      `Oba, Lia! Sua presença nos 15 anos da Isabella está confirmada. Se quiser presentear, a lista de presentes (com sugestões de onde comprar) e a opção de Pix estão no seu convite: ${inviteUrl(g.token)}#gifts`,
    )
    expect((await row(r.id)).status).toBe('sent')
  })

  it('sends the gift nudge with the gifts-anchor link', async () => {
    const { g } = await dueGift('gift_nudge')
    const { deps } = makeDeps(DAY)
    await runDispatcherTick(deps)
    expect(deps.sendText.mock.calls[0][1].text).toBe(
      `Oi, Lia! Que bom que você vem aos 15 anos da Isabella. Se quiser presentear, a lista de presentes (com sugestões de onde comprar) e a opção de Pix estão no seu convite: ${inviteUrl(g.token)}#gifts — Se você já escolheu um presente ou fez o Pix, pode ignorar esta mensagem.`,
    )
  })

  it.each(['gift_list', 'gift_nudge'] as const)('cancels %s for a guest who reserved a gift meanwhile (gift_given)', async (kind) => {
    const { g, r } = await dueGift(kind)
    const gift = await createGift({ name: 'Perfume', category: 'Beleza', priceCents: null, imageUrl: null, purchaseUrl: null })
    await db.update(gifts).set({ guestId: g.id }).where(eq(gifts.id, gift.id))
    const { deps } = makeDeps(DAY)
    expect(await runDispatcherTick(deps)).toEqual({ sent: 0, failed: 0, skipped: null })
    expect(deps.sendText).not.toHaveBeenCalled()
    const s = await row(r.id)
    expect([s.status, s.errorCode]).toEqual(['cancelled', 'gift_given'])
  })

  it.each(['gift_list', 'gift_nudge'] as const)('cancels %s for a guest no longer yes', async (kind) => {
    const { r } = await dueGift(kind, { rsvpStatus: 'no' })
    const { deps } = makeDeps(DAY)
    await runDispatcherTick(deps)
    expect(deps.sendText).not.toHaveBeenCalled()
    expect((await row(r.id)).status).toBe('cancelled')
  })

  it.each(['gift_list', 'gift_nudge'] as const)('cancels %s with the gifts flag off (feature_off) but still sends reminders', async (kind) => {
    vi.stubEnv('FEATURES', 'pix')
    const { r } = await dueGift(kind)
    const other = await makeGuest({ rsvpStatus: 'yes', phone: PHONE })
    const d7 = await makeReminder(other.id, 'reminder_d7', new Date((await dbNow()).getTime() - MIN))
    const { deps } = makeDeps(DAY)
    expect(await runDispatcherTick(deps)).toEqual({ sent: 1, failed: 0, skipped: null })
    const s = await row(r.id)
    expect([s.status, s.errorCode]).toEqual(['cancelled', 'feature_off'])
    expect((await row(d7.id)).status).toBe('sent')
  })

  it.each(['gift_list', 'gift_nudge'] as const)('cancels %s from 20/12 10h on (gift_window_closed)', async (kind) => {
    const { r } = await dueGift(kind)
    const { deps } = makeDeps(new Date('2026-12-20T14:00:00Z'))
    await runDispatcherTick(deps)
    expect(deps.sendText).not.toHaveBeenCalled()
    const s = await row(r.id)
    expect([s.status, s.errorCode]).toEqual(['cancelled', 'gift_window_closed'])
  })
})

describe('startDispatcher', () => {
  function slowDeps() {
    const pending: Array<() => void> = []
    const deps: DispatcherDeps = {
      now: () => DAY,
      sleep: async () => {},
      random: () => 0,
      sendText: vi.fn(),
      // a tick that hangs until released (stands in for minutes of spaced sends)
      getConnectionState: vi.fn(
        () =>
          new Promise<EvolutionResult<'open' | 'connecting' | 'close'>>((resolve) => {
            pending.push(() => resolve({ ok: true, value: 'close' }))
          }),
      ),
      readEvolutionConfig: () => CFG,
    }
    return { deps, release: () => pending.splice(0).forEach((r) => r()) }
  }

  it('is idempotent: a second call does not start another interval', async () => {
    // only the interval is faked: the tick does real DB I/O (recovery) before reaching the deps
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const { deps, release } = slowDeps()
    startDispatcher(deps)
    startDispatcher(deps)
    await vi.advanceTimersByTimeAsync(60_000)
    await vi.waitFor(() => expect(deps.getConnectionState).toHaveBeenCalledTimes(1))
    release()
  })

  it('never overlaps a long tick with the next interval', async () => {
    // only the interval is faked: the tick does real DB I/O (recovery) before reaching the deps
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const { deps, release } = slowDeps()
    startDispatcher(deps)
    await vi.advanceTimersByTimeAsync(60_000)
    await vi.waitFor(() => expect(deps.getConnectionState).toHaveBeenCalledTimes(1))
    await vi.advanceTimersByTimeAsync(180_000)
    expect(deps.getConnectionState).toHaveBeenCalledTimes(1)
    release()
    await vi.waitFor(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
      expect(deps.getConnectionState).toHaveBeenCalledTimes(2)
    })
    release()
  })

  it('swallows and logs a crashing tick', async () => {
    // only the interval is faked: the tick does real DB I/O (recovery) before reaching the deps
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const log = vi.spyOn(logger, 'error').mockImplementation(() => {})
    const deps: DispatcherDeps = {
      ...slowDeps().deps,
      getConnectionState: vi.fn(async () => {
        throw new Error('boom')
      }),
    }
    startDispatcher(deps)
    await vi.advanceTimersByTimeAsync(60_000)
    await vi.waitFor(() =>
      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'whatsapp.dispatcher_error' }),
        expect.any(String),
      ),
    )
  })
})
