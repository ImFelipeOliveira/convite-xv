import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { afterGiftChange } from '@/features/gifts/after-change'
import { GIVEN_CHECKS, guestHasGiven } from '@/features/gifts/given'
import { createGift } from '@/features/gifts/repo'
import { inviteUrl } from '@/features/guests/whatsapp'
import { submitRsvp } from '@/features/rsvp/service'
import { db } from '@/server/db/client'
import {
  GIFT_LIST_TEXT_DEFAULT,
  GIFT_NUDGE_TEXT_DEFAULT,
  gifts,
  guests,
  messageDispatches,
  type Guest,
} from '@/server/db/schema'
import { makeGuest } from '../../../../tests/helpers/db'
import { DISPATCH_KIND_LABEL, dispatchErrorLabel } from '../dispatch-labels'
import { GIFT_MESSAGES_CUTOFF, giftInviteUrl, syncGiftMessages, syncRemindersForGuest } from '../reminders'

const PHONE = '+5595991234567'
const T = new Date('2026-11-01T15:00:00Z')
const DAY_MS = 24 * 60 * 60 * 1000
const giftBase = { category: 'Beleza', priceCents: null, imageUrl: null, purchaseUrl: null }

async function rows(guestId: string) {
  return db.select().from(messageDispatches).where(eq(messageDispatches.guestId, guestId))
}

async function giftRows(guestId: string) {
  return (await rows(guestId))
    .filter((r) => r.kind === 'gift_list' || r.kind === 'gift_nudge')
    .map((r) => ({ kind: r.kind, status: r.status, at: r.scheduledFor?.toISOString() }))
    .sort((a, b) => a.kind.localeCompare(b.kind))
}

async function confirmed(over: Partial<Guest> = {}) {
  return makeGuest({ rsvpStatus: 'yes', phone: PHONE, respondedAt: T, ...over })
}

beforeEach(() => vi.stubEnv('FEATURES', 'gifts'))
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('gift message defaults and labels', () => {
  it('has the exact default texts', () => {
    expect(GIFT_LIST_TEXT_DEFAULT).toBe(
      'Oba, {nome}! Sua presença nos 15 anos da Isabella está confirmada. Se quiser presentear, a lista de presentes (com sugestões de onde comprar) e a opção de Pix estão no seu convite: {link}',
    )
    expect(GIFT_NUDGE_TEXT_DEFAULT).toBe(
      'Oi, {nome}! Que bom que você vem aos 15 anos da Isabella. Se quiser presentear, a lista de presentes (com sugestões de onde comprar) e a opção de Pix estão no seu convite: {link} — Se você já escolheu um presente ou fez o Pix, pode ignorar esta mensagem.',
    )
  })

  it('labels the kinds and the new cancel codes in pt-BR', () => {
    expect(DISPATCH_KIND_LABEL.gift_list).toBe('Lista de presentes')
    expect(DISPATCH_KIND_LABEL.gift_nudge).toBe('Lembrete de presente')
    expect(dispatchErrorLabel('feature_off')).not.toBe('Erro no envio')
    expect(dispatchErrorLabel('gift_given')).not.toBe('Erro no envio')
    expect(dispatchErrorLabel('event_day')).not.toBe('Erro no envio')
    expect(dispatchErrorLabel('gift_window_closed')).not.toBe('Erro no envio')
  })

  it('links to the gifts anchor of the invite', () => {
    expect(giftInviteUrl('abc')).toBe(`${inviteUrl('abc')}#gifts`)
  })
})

describe('guestHasGiven', () => {
  it('is true once the guest has a reserved gift', async () => {
    const g = await confirmed()
    expect(await guestHasGiven(g.id)).toBe(false)
    const gift = await createGift({ ...giftBase, name: 'Perfume' })
    await db.update(gifts).set({ guestId: g.id }).where(eq(gifts.id, gift.id))
    expect(await guestHasGiven(g.id)).toBe(true)
  })

  it('ORs every check (seam for the paid Pix check)', async () => {
    const g = await confirmed()
    expect(GIVEN_CHECKS.length).toBeGreaterThanOrEqual(2)
    expect(await guestHasGiven(g.id, [async () => false, async () => true])).toBe(true)
    expect(await guestHasGiven(g.id, [async () => false, async () => false])).toBe(false)
  })
})

describe('syncGiftMessages', () => {
  it('schedules the gift list at respondedAt and the nudge 5 days later', async () => {
    const g = await confirmed()
    await syncGiftMessages(g, T, 'rsvp')
    expect(await giftRows(g.id)).toEqual([
      { kind: 'gift_list', status: 'scheduled', at: T.toISOString() },
      { kind: 'gift_nudge', status: 'scheduled', at: new Date(T.getTime() + 5 * DAY_MS).toISOString() },
    ])
  })

  it('schedules nothing with the gifts flag off', async () => {
    vi.stubEnv('FEATURES', 'pix')
    const g = await confirmed()
    await syncGiftMessages(g, T, 'rsvp')
    expect(await giftRows(g.id)).toEqual([])
  })

  it('schedules nothing without phone, or for a pending/no guest', async () => {
    for (const over of [{ phone: null }, { rsvpStatus: 'pending' as const }, { rsvpStatus: 'no' as const }]) {
      const g = await confirmed(over)
      await syncGiftMessages(g, T, 'rsvp')
      expect(await giftRows(g.id)).toEqual([])
    }
  })

  it('schedules nothing for a guest who already gave', async () => {
    const g = await confirmed()
    const gift = await createGift({ ...giftBase, name: 'Perfume' })
    await db.update(gifts).set({ guestId: g.id }).where(eq(gifts.id, gift.id))
    await syncGiftMessages(g, T, 'rsvp')
    expect(await giftRows(g.id)).toEqual([])
  })

  it('confirming on 16/12: gift list only (the nudge would fall on/after 20/12 10h)', async () => {
    const at = new Date('2026-12-16T15:00:00Z')
    const g = await confirmed({ respondedAt: at })
    await syncGiftMessages(g, at, 'rsvp')
    expect(await giftRows(g.id)).toEqual([{ kind: 'gift_list', status: 'scheduled', at: at.toISOString() }])
  })

  it('confirming at/after 20/12 10h: nothing', async () => {
    const g = await confirmed({ respondedAt: GIFT_MESSAGES_CUTOFF })
    await syncGiftMessages(g, GIFT_MESSAGES_CUTOFF, 'rsvp')
    expect(await giftRows(g.id)).toEqual([])
  })

  it('a nudge already in the past is not scheduled', async () => {
    const g = await confirmed()
    await syncGiftMessages(g, new Date(T.getTime() + 6 * DAY_MS), 'gift')
    expect((await giftRows(g.id)).filter((r) => r.kind === 'gift_nudge')).toEqual([])
  })

  it('yes → no cancels both (also through the confirmed-reminder sync used by the admin)', async () => {
    const g = await confirmed()
    await syncGiftMessages(g, T, 'rsvp')
    await syncRemindersForGuest({ ...g, rsvpStatus: 'no' }, T)
    expect((await giftRows(g.id)).map((r) => r.status)).toEqual(['cancelled', 'cancelled'])
  })
})

describe('afterGiftChange (guest-driven reserve/release)', () => {
  it('reserving cancels both pending messages', async () => {
    const g = await confirmed({ respondedAt: new Date() })
    await syncGiftMessages(g, new Date(), 'rsvp')
    const gift = await createGift({ ...giftBase, name: 'Perfume' })
    await db.update(gifts).set({ guestId: g.id }).where(eq(gifts.id, gift.id))
    await afterGiftChange(g.id)
    expect((await giftRows(g.id)).map((r) => r.status)).toEqual(['cancelled', 'cancelled'])
  })

  it('releasing re-arms the nudge (still in the window) but not the gift list', async () => {
    const respondedAt = new Date()
    const g = await confirmed({ respondedAt })
    await syncGiftMessages(g, respondedAt, 'rsvp')
    const gift = await createGift({ ...giftBase, name: 'Perfume' })
    await db.update(gifts).set({ guestId: g.id }).where(eq(gifts.id, gift.id))
    await afterGiftChange(g.id)
    await db.update(gifts).set({ guestId: null }).where(eq(gifts.id, gift.id))
    await afterGiftChange(g.id)
    const r = await giftRows(g.id)
    expect(r).toEqual([
      { kind: 'gift_list', status: 'cancelled', at: respondedAt.toISOString() },
      { kind: 'gift_nudge', status: 'scheduled', at: new Date(respondedAt.getTime() + 5 * DAY_MS).toISOString() },
    ])
  })

  it('does nothing for an unknown guest', async () => {
    await expect(afterGiftChange('00000000-0000-4000-8000-000000000000')).resolves.toBeUndefined()
  })
})

describe('submitRsvp → gift messages', () => {
  it('a yes schedules both; a later no cancels both', async () => {
    const g = await makeGuest({ phone: PHONE })
    await submitRsvp({ token: g.token, status: 'yes', plusOnes: 0 }, T)
    expect((await giftRows(g.id)).map((r) => [r.kind, r.status])).toEqual([
      ['gift_list', 'scheduled'],
      ['gift_nudge', 'scheduled'],
    ])
    await submitRsvp({ token: g.token, status: 'no' }, T)
    expect((await giftRows(g.id)).map((r) => r.status)).toEqual(['cancelled', 'cancelled'])
  })

  it('a yes with the flag off schedules no gift message', async () => {
    vi.stubEnv('FEATURES', '')
    const g = await makeGuest({ phone: PHONE })
    await submitRsvp({ token: g.token, status: 'yes', plusOnes: 0 }, T)
    expect(await giftRows(g.id)).toEqual([])
    const [row] = await db.select().from(guests).where(eq(guests.id, g.id))
    expect(row.rsvpStatus).toBe('yes')
  })
})
