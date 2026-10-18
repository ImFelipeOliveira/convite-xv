import { and, eq, ne } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { inviteUrl } from '@/features/guests/whatsapp'
import { db } from '@/server/db/client'
import { admins, messageDispatches } from '@/server/db/schema'
import { makeGuest } from '../../../../tests/helpers/db'
import type { EvolutionConfig } from '../config'
import type { EvolutionResult, sendText } from '../evolution'
import { inviteErrorMessage, sendInvite } from '../invite'
import * as reminders from '../reminders'
import { logger } from '@/lib/logger'

const CFG: EvolutionConfig = { url: 'http://evolution.test', apiKey: 'k', instance: 'convite-xv' }
const PHONE = '+5595991234567'

type SendResult = EvolutionResult<{ messageId: string | null }>

function deps(result: SendResult = { ok: true, value: { messageId: 'MSG-1' } }, cfg: EvolutionConfig | null = CFG) {
  return {
    sendText: vi.fn<typeof sendText>(async () => result),
    readEvolutionConfig: vi.fn(() => cfg),
  }
}

async function makeAdmin() {
  const [a] = await db
    .insert(admins)
    .values({ email: `a${Math.random()}@x.com`, passwordHash: 'x' })
    .returning()
  return a.id
}

/** Invite rows of a guest (a successful send also schedules the rsvp nudges). */
async function rows(guestId: string) {
  return db
    .select()
    .from(messageDispatches)
    .where(and(eq(messageDispatches.guestId, guestId), eq(messageDispatches.kind, 'invite')))
}

async function nudgeRows(guestId: string) {
  return db
    .select()
    .from(messageDispatches)
    .where(and(eq(messageDispatches.guestId, guestId), ne(messageDispatches.kind, 'invite')))
}

describe('sendInvite', () => {
  it('sends the rendered default template to the guest phone and records sent', async () => {
    const g = await makeGuest({ name: 'Ana Souza', phone: PHONE })
    const adminId = await makeAdmin()
    const d = deps()

    const r = await sendInvite(g.id, adminId, d)

    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error('unreachable')
    expect(Number.isNaN(new Date(r.sentAt).getTime())).toBe(false)
    expect(d.sendText).toHaveBeenCalledTimes(1)
    const [cfg, input] = d.sendText.mock.calls[0]
    expect(cfg).toBe(CFG)
    expect(input.phoneE164).toBe(PHONE)
    expect(input.text).toMatch(/^Olá, Ana! /)
    expect(input.text).toContain(inviteUrl(g.token))
    expect(input.text.endsWith(`/c/${g.token}`)).toBe(true)

    const [row] = await rows(g.id)
    expect(row.status).toBe('sent')
    expect(row.kind).toBe('invite')
    expect(row.providerMessageId).toBe('MSG-1')
    expect(row.adminId).toBe(adminId)
    expect(row.sentAt?.toISOString()).toBe(r.sentAt)
  })

  it('returns not_configured without touching the database when config is missing', async () => {
    const g = await makeGuest({ phone: PHONE })
    const d = deps(undefined, null)
    expect(await sendInvite(g.id, await makeAdmin(), d)).toEqual({ ok: false, error: 'not_configured' })
    expect(d.sendText).not.toHaveBeenCalled()
    expect(await rows(g.id)).toHaveLength(0)
  })

  it('returns no_phone for a guest without phone', async () => {
    const g = await makeGuest({ phone: null })
    const d = deps()
    expect(await sendInvite(g.id, await makeAdmin(), d)).toEqual({ ok: false, error: 'no_phone' })
    expect(d.sendText).not.toHaveBeenCalled()
    expect(await rows(g.id)).toHaveLength(0)
  })

  it('returns not_found for an unknown guest', async () => {
    const d = deps()
    expect(await sendInvite('00000000-0000-4000-8000-000000000000', await makeAdmin(), d)).toEqual({
      ok: false,
      error: 'not_found',
    })
    expect(d.sendText).not.toHaveBeenCalled()
  })

  it('invalid_number passes through and records a failed row', async () => {
    const g = await makeGuest({ phone: PHONE })
    const d = deps({ ok: false, error: 'invalid_number' })
    expect(await sendInvite(g.id, await makeAdmin(), d)).toEqual({ ok: false, error: 'invalid_number' })
    const [row] = await rows(g.id)
    expect(row.status).toBe('failed')
    expect(row.errorCode).toBe('invalid_number')
  })

  it('not_connected passes through', async () => {
    const g = await makeGuest({ phone: PHONE })
    const d = deps({ ok: false, error: 'not_connected' })
    expect(await sendInvite(g.id, await makeAdmin(), d)).toEqual({ ok: false, error: 'not_connected' })
    expect((await rows(g.id))[0].errorCode).toBe('not_connected')
  })

  it.each(['timeout', 'unauthorized', 'provider_error'] as const)(
    '%s maps to failed and records the client error code',
    async (error) => {
      const g = await makeGuest({ phone: PHONE })
      const d = deps({ ok: false, error })
      expect(await sendInvite(g.id, await makeAdmin(), d)).toEqual({ ok: false, error: 'failed' })
      const [row] = await rows(g.id)
      expect(row.status).toBe('failed')
      expect(row.errorCode).toBe(error)
    },
  )

  it('a second call within 60 s is blocked and sends only once', async () => {
    const g = await makeGuest({ phone: PHONE })
    const adminId = await makeAdmin()
    const d = deps()
    expect((await sendInvite(g.id, adminId, d)).ok).toBe(true)
    expect(await sendInvite(g.id, adminId, d)).toEqual({ ok: false, error: 'blocked' })
    expect(d.sendText).toHaveBeenCalledTimes(1)
    expect(await rows(g.id)).toHaveLength(1)
  })

  it('concurrent calls send only once', async () => {
    const g = await makeGuest({ phone: PHONE })
    const adminId = await makeAdmin()
    const d = deps()
    const results = await Promise.all([sendInvite(g.id, adminId, d), sendInvite(g.id, adminId, d)])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results).toContainEqual({ ok: false, error: 'blocked' })
    expect(d.sendText).toHaveBeenCalledTimes(1)
  })
})

// Nudge timing rules are covered in reminders.test.ts with fixed dates; here only the wiring is
// checked (sendInvite hands the invite's sent_at to scheduleRsvpNudges), so nothing depends on today.
describe('sendInvite rsvp nudges', () => {
  const realSchedule = reminders.scheduleRsvpNudges
  const DEADLINE = '2026-12-13' // settings default
  const shape = (r: Awaited<ReturnType<typeof nudgeRows>>) =>
    r.map((n) => ({ kind: n.kind, status: n.status, at: n.scheduledFor?.toISOString() })).sort((a, b) => a.kind.localeCompare(b.kind))

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('schedules the nudges from the recorded invite sent_at and the deadline', async () => {
    const spy = vi.spyOn(reminders, 'scheduleRsvpNudges')
    const g = await makeGuest({ phone: PHONE })
    const r = await sendInvite(g.id, await makeAdmin(), deps())
    if (!r.ok) throw new Error('send failed')
    const [invite] = await rows(g.id)

    expect(spy).toHaveBeenCalledTimes(1)
    const [guestArg, sentAtArg, deadlineArg] = spy.mock.calls[0]
    expect(guestArg).toMatchObject({ id: g.id, rsvpStatus: 'pending' })
    expect(sentAtArg.getTime()).toBe(invite.sentAt!.getTime())
    expect(deadlineArg).toBe(DEADLINE)

    // same rows as the rules produce for that sent_at
    const twin = await makeGuest({ phone: PHONE })
    await realSchedule(twin, invite.sentAt!, DEADLINE)
    expect(shape(await nudgeRows(g.id))).toEqual(shape(await nudgeRows(twin.id)))
  })

  it('schedules no nudge for a guest who already answered', async () => {
    const g = await makeGuest({ phone: PHONE, rsvpStatus: 'no' })
    expect((await sendInvite(g.id, await makeAdmin(), deps())).ok).toBe(true)
    expect(await nudgeRows(g.id)).toHaveLength(0)
  })

  it('schedules nothing when the send fails', async () => {
    const spy = vi.spyOn(reminders, 'scheduleRsvpNudges')
    const g = await makeGuest({ phone: PHONE })
    await sendInvite(g.id, await makeAdmin(), deps({ ok: false, error: 'not_connected' }))
    expect(spy).not.toHaveBeenCalled()
    expect(await nudgeRows(g.id)).toHaveLength(0)
  })

  it('a resend keeps a single nudge', async () => {
    // pin the invite time so a nudge is always due (today's date must not matter)
    const spy = vi
      .spyOn(reminders, 'scheduleRsvpNudges')
      .mockImplementation((guest, _sentAt, deadline) => realSchedule(guest, new Date('2026-11-01T12:00:00Z'), deadline))
    const g = await makeGuest({ phone: PHONE })
    const adminId = await makeAdmin()
    expect((await sendInvite(g.id, adminId, deps())).ok).toBe(true)
    // step out of the 60 s resend window
    await db
      .update(messageDispatches)
      .set({ sentAt: new Date(Date.now() - 120_000) })
      .where(and(eq(messageDispatches.guestId, g.id), eq(messageDispatches.kind, 'invite')))
    expect((await sendInvite(g.id, adminId, deps())).ok).toBe(true)
    expect(spy).toHaveBeenCalledTimes(2)
    expect(await rows(g.id)).toHaveLength(2)
    expect((await nudgeRows(g.id)).filter((n) => n.kind === 'rsvp_nudge')).toHaveLength(1)
  })

  it('a scheduling failure never fails the send', async () => {
    vi.spyOn(reminders, 'scheduleRsvpNudges').mockRejectedValue(new Error('db down'))
    const log = vi.spyOn(logger, 'error').mockImplementation(() => {})
    const g = await makeGuest({ phone: PHONE })
    expect((await sendInvite(g.id, await makeAdmin(), deps())).ok).toBe(true)
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'whatsapp.reminder_sync_failed', guestId: g.id, err: expect.any(Error) }),
      expect.any(String),
    )
  })
})

describe('inviteErrorMessage', () => {
  it('maps every error to pt-BR copy', () => {
    expect(inviteErrorMessage('not_configured')).toBe('WhatsApp não configurado.')
    expect(inviteErrorMessage('not_connected')).toBe('Conecte o WhatsApp na aba WhatsApp do painel.')
    expect(inviteErrorMessage('no_phone')).toBe('Cadastre o telefone do convidado.')
    expect(inviteErrorMessage('not_found')).toBe('Convidado não encontrado.')
    expect(inviteErrorMessage('blocked')).toBe('Envio em andamento. Aguarde um minuto.')
    expect(inviteErrorMessage('invalid_number')).toBe('Este número não tem WhatsApp.')
    expect(inviteErrorMessage('failed')).toBe('Não foi possível enviar agora. Tente de novo.')
  })
})
