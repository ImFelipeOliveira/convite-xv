import { eq, sql } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { inviteUrl } from '@/features/guests/whatsapp'
import { db } from '@/server/db/client'
import { guests, messageDispatches, settings, type DispatchKind } from '@/server/db/schema'
import { makeGuest } from '../../../../tests/helpers/db'
import type { EvolutionConfig } from '../config'
import { dbNow, retryFailedReminder } from '../dispatches'
import { greetingSeed, runDispatcherTick, type DispatcherDeps } from '../dispatcher'
import type { EvolutionError, EvolutionResult } from '../evolution'
import { varyGreeting } from '../message'

const CFG: EvolutionConfig = { url: 'http://evolution.test', apiKey: 'k', instance: 'convite-xv' }
const PHONE = '+5595991234567'
const MIN = 60 * 1000

type SendResult = EvolutionResult<{ messageId: string | null }>

function makeDeps(
  now: Date,
  opts: {
    send?: (n: number) => SendResult
    state?: EvolutionResult<'open' | 'connecting' | 'close'>
    cfg?: EvolutionConfig | null
    random?: number
  } = {},
) {
  let n = 0
  const sleeps: number[] = []
  const deps = {
    now: () => now,
    sleep: vi.fn(async (ms: number) => {
      sleeps.push(ms)
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

describe('runDispatcherTick', () => {
  it('sends two due reminders in order with one 20–60 s pause between them', async () => {
    const now = await dbNow()
    const a = await makeGuest({ name: 'Ana Souza', rsvpStatus: 'yes', phone: PHONE })
    const b = await makeGuest({ name: 'Bruno Lima', rsvpStatus: 'yes', phone: '+5595990000001' })
    const r1 = await makeReminder(a.id, 'reminder_d7', new Date(now.getTime() - 2 * MIN))
    const r2 = await makeReminder(b.id, 'reminder_d7', new Date(now.getTime() - 1 * MIN))
    const { deps, sleeps } = makeDeps(now, { random: 0.25 })

    const res = await runDispatcherTick(deps)

    expect(res).toEqual({ sent: 2, failed: 0, skipped: null })
    expect(deps.sendText.mock.calls.map((c) => c[1].phoneE164)).toEqual([PHONE, '+5595990000001'])
    expect(sleeps).toEqual([30_000])
    expect(sleeps[0]).toBeGreaterThanOrEqual(20_000)
    expect(sleeps[0]).toBeLessThanOrEqual(60_000)
    const s1 = await row(r1.id)
    const s2 = await row(r2.id)
    expect([s1.status, s1.providerMessageId]).toEqual(['sent', 'MSG-1'])
    expect([s2.status, s2.providerMessageId]).toEqual(['sent', 'MSG-2'])
    expect(s1.sentAt).not.toBeNull()
  })

  it('renders the settings template with first name, invite link and a seeded greeting', async () => {
    const now = await dbNow()
    await db
      .update(settings)
      .set({ reminderD1Text: 'Olá, {nome}! Amanhã é o dia. {link}' })
      .where(eq(settings.id, 1))
    const g = await makeGuest({ name: 'Carla Maria Dias', rsvpStatus: 'yes', phone: PHONE })
    await makeReminder(g.id, 'reminder_d1', new Date(now.getTime() - MIN))
    const { deps } = makeDeps(now)

    await runDispatcherTick(deps)

    const base = `Olá, Carla! Amanhã é o dia. ${inviteUrl(g.token)}`
    expect(deps.sendText.mock.calls[0][1].text).toBe(varyGreeting(base, greetingSeed(g.id, 1)))
  })

  it('varies the greeting between attempts of the same reminder', () => {
    const id = '00000000-0000-4000-8000-000000000001'
    const text = 'Olá, Ana!'
    const variants = new Set([1, 2, 3].map((a) => varyGreeting(text, greetingSeed(id, a))))
    expect(variants.size).toBe(3)
  })

  it('reschedules a timeout on the first attempt +5 min, then +15 min, and fails the third', async () => {
    const now = await dbNow()
    const g = await makeGuest({ rsvpStatus: 'yes', phone: PHONE })
    const r = await makeReminder(g.id, 'reminder_d7', new Date(now.getTime() - MIN))
    const { deps } = makeDeps(now, { send: () => fail('timeout') })

    expect(await runDispatcherTick(deps)).toEqual({ sent: 0, failed: 1, skipped: null })
    let s = await row(r.id)
    expect(s.status).toBe('scheduled')
    expect(s.attempts).toBe(1)
    expect(s.errorCode).toBe('timeout')
    expect(s.scheduledFor?.getTime()).toBe(now.getTime() + 5 * MIN)

    const later = new Date(now.getTime() + 5 * MIN)
    await runDispatcherTick(makeDeps(later, { send: () => fail('timeout') }).deps)
    s = await row(r.id)
    expect([s.status, s.attempts]).toEqual(['scheduled', 2])
    expect(s.scheduledFor?.getTime()).toBe(later.getTime() + 15 * MIN)

    const last = new Date(later.getTime() + 15 * MIN)
    await runDispatcherTick(makeDeps(last, { send: () => fail('provider_error') }).deps)
    s = await row(r.id)
    expect([s.status, s.attempts, s.errorCode]).toEqual(['failed', 3, 'provider_error'])
  })

  it('does not claim anything when the instance is not open', async () => {
    const now = await dbNow()
    const g = await makeGuest({ rsvpStatus: 'yes', phone: PHONE })
    const r = await makeReminder(g.id, 'reminder_d7', new Date(now.getTime() - MIN))
    const { deps } = makeDeps(now, { state: { ok: true, value: 'close' } })

    expect(await runDispatcherTick(deps)).toEqual({ sent: 0, failed: 0, skipped: 'not_connected' })
    expect(deps.sendText).not.toHaveBeenCalled()
    const s = await row(r.id)
    expect([s.status, s.attempts]).toEqual(['scheduled', 0])
    expect(s.updatedAt.getTime()).toBe(r.updatedAt.getTime())
  })

  it('stops the tick on not_connected and reschedules +5 min without consuming an attempt', async () => {
    const now = await dbNow()
    const a = await makeGuest({ rsvpStatus: 'yes', phone: PHONE })
    const b = await makeGuest({ rsvpStatus: 'yes', phone: PHONE })
    const r1 = await makeReminder(a.id, 'reminder_d7', new Date(now.getTime() - 2 * MIN))
    const r2 = await makeReminder(b.id, 'reminder_d7', new Date(now.getTime() - MIN))
    const { deps } = makeDeps(now, { send: () => fail('not_connected') })

    expect(await runDispatcherTick(deps)).toEqual({ sent: 0, failed: 0, skipped: 'not_connected' })
    expect(deps.sendText).toHaveBeenCalledTimes(1)
    const s1 = await row(r1.id)
    expect([s1.status, s1.attempts, s1.errorCode]).toEqual(['scheduled', 0, 'not_connected'])
    expect(s1.scheduledFor?.getTime()).toBe(now.getTime() + 5 * MIN)
    expect((await row(r2.id)).status).toBe('scheduled')
  })

  it('cancels a reminder whose guest switched to no, sending nothing', async () => {
    const now = await dbNow()
    const g = await makeGuest({ rsvpStatus: 'yes', phone: PHONE })
    const r = await makeReminder(g.id, 'reminder_d7', new Date(now.getTime() - MIN))
    await db.update(guests).set({ rsvpStatus: 'no' }).where(eq(guests.id, g.id))
    const { deps, sleeps } = makeDeps(now)

    expect(await runDispatcherTick(deps)).toEqual({ sent: 0, failed: 0, skipped: null })
    expect(deps.sendText).not.toHaveBeenCalled()
    expect(sleeps).toEqual([])
    expect((await row(r.id)).status).toBe('cancelled')
  })

  it('cancels a reminder for a guest without phone', async () => {
    const now = await dbNow()
    const g = await makeGuest({ rsvpStatus: 'yes', phone: null })
    const r = await makeReminder(g.id, 'reminder_d1', new Date(now.getTime() - MIN))
    const { deps } = makeDeps(now)
    await runDispatcherTick(deps)
    expect(deps.sendText).not.toHaveBeenCalled()
    expect((await row(r.id)).status).toBe('cancelled')
  })

  it('recovers a sending row stuck for 11 min and sends it in the same tick', async () => {
    const now = await dbNow()
    const g = await makeGuest({ rsvpStatus: 'yes', phone: PHONE })
    const r = await makeReminder(g.id, 'reminder_d1', new Date(now.getTime() - 20 * MIN), {
      status: 'sending',
      attempts: 1,
    })
    await db
      .update(messageDispatches)
      .set({ updatedAt: new Date(now.getTime() - 11 * MIN) })
      .where(eq(messageDispatches.id, r.id))
    const { deps } = makeDeps(now)

    expect(await runDispatcherTick(deps)).toEqual({ sent: 1, failed: 0, skipped: null })
    const s = await row(r.id)
    expect([s.status, s.attempts]).toEqual(['sent', 2])
  })

  it('fails a recovered row that already used its 3 attempts without sending again', async () => {
    const now = await dbNow()
    const g = await makeGuest({ rsvpStatus: 'yes', phone: PHONE })
    const r = await makeReminder(g.id, 'reminder_d1', new Date(now.getTime() - 30 * MIN), {
      status: 'sending',
      attempts: 3,
    })
    await db
      .update(messageDispatches)
      .set({ updatedAt: new Date(now.getTime() - 11 * MIN) })
      .where(eq(messageDispatches.id, r.id))
    const { deps } = makeDeps(now)

    await runDispatcherTick(deps)
    expect(deps.sendText).not.toHaveBeenCalled()
    expect((await row(r.id)).status).toBe('failed')
  })

  it('picks up a failed reminder re-armed by retryFailedReminder on the next tick', async () => {
    const g = await makeGuest({ rsvpStatus: 'yes', phone: PHONE })
    const r = await makeReminder(g.id, 'reminder_d7', new Date(Date.now() - 60 * MIN), {
      status: 'failed',
      attempts: 3,
      errorCode: 'timeout',
    })
    expect(await retryFailedReminder(r.id)).toBe(true)
    const { deps } = makeDeps(await dbNow())

    expect(await runDispatcherTick(deps)).toEqual({ sent: 1, failed: 0, skipped: null })
    expect([(await row(r.id)).status, (await row(r.id)).attempts]).toEqual(['sent', 1])
  })

  it('skips when Evolution is not configured', async () => {
    const now = await dbNow()
    const { deps } = makeDeps(now, { cfg: null })
    expect(await runDispatcherTick(deps)).toEqual({ sent: 0, failed: 0, skipped: 'not_configured' })
    expect(deps.getConnectionState).not.toHaveBeenCalled()
  })

  it('caps a tick at 30 sends', async () => {
    const now = await dbNow()
    for (let i = 0; i < 31; i++) {
      const g = await makeGuest({ rsvpStatus: 'yes', phone: PHONE })
      await makeReminder(g.id, 'reminder_d7', new Date(now.getTime() - (40 - i) * MIN))
    }
    const { deps, sleeps } = makeDeps(now)
    expect(await runDispatcherTick(deps)).toEqual({ sent: 30, failed: 0, skipped: null })
    expect(sleeps).toHaveLength(29)
    const [{ left }] = await db.execute<{ left: number }>(
      sql`SELECT count(*)::int AS left FROM message_dispatches WHERE status = 'scheduled'`,
    )
    expect(left).toBe(1)
  })
})

describe('runDispatcherTick — rsvp nudges', () => {
  it('sends the nudge text (preferred date) to a guest still pending', async () => {
    const now = await dbNow()
    await db
      .update(settings)
      .set({ rsvpDeadline: '2099-12-31', rsvpPreferredDate: '2099-11-21' })
      .where(eq(settings.id, 1))
    const g = await makeGuest({ name: 'Davi Rocha', rsvpStatus: 'pending', phone: PHONE })
    const r = await makeReminder(g.id, 'rsvp_nudge', new Date(now.getTime() - MIN))
    const { deps } = makeDeps(now)

    expect(await runDispatcherTick(deps)).toEqual({ sent: 1, failed: 0, skipped: null })
    expect(deps.sendText.mock.calls[0][1].text).toBe(
      `Oi, Davi! Ainda não recebemos sua confirmação para os 15 anos da Isabella. Se puder, responda até 21/11 pelo seu convite: ${inviteUrl(g.token)}`,
    )
    expect((await row(r.id)).status).toBe('sent')
  })

  it('sends the final notice with the deadline', async () => {
    const now = await dbNow()
    const g = await makeGuest({ name: 'Eva Melo', rsvpStatus: 'pending', phone: PHONE })
    await makeReminder(g.id, 'rsvp_final', new Date(now.getTime() - MIN))
    const { deps } = makeDeps(now)
    await runDispatcherTick(deps)
    expect(deps.sendText.mock.calls[0][1].text).toBe(
      `Oi, Eva! O prazo para confirmar presença nos 15 anos da Isabella termina em 13/12. Responda pelo seu convite: ${inviteUrl(g.token)}`,
    )
  })

  it('cancels a nudge for a guest who answered meanwhile', async () => {
    const now = await dbNow()
    const g = await makeGuest({ rsvpStatus: 'pending', phone: PHONE })
    const r1 = await makeReminder(g.id, 'rsvp_nudge', new Date(now.getTime() - MIN))
    await db.update(guests).set({ rsvpStatus: 'yes' }).where(eq(guests.id, g.id))
    const { deps } = makeDeps(now)

    await runDispatcherTick(deps)
    expect(deps.sendText).not.toHaveBeenCalled()
    expect((await row(r1.id)).status).toBe('cancelled')
  })
})
