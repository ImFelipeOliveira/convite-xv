import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { logger } from '@/lib/logger'
import { db } from '@/server/db/client'
import { guests } from '@/server/db/schema'
import { makeGuest } from '../../../../tests/helpers/db'
import { recordInviteOpened } from '../opened'

const BROWSER_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

async function openedAt(id: string) {
  const [g] = await db.select({ openedAt: guests.openedAt }).from(guests).where(eq(guests.id, id))
  return g.openedAt
}

describe('recordInviteOpened', () => {
  it('marks the first open and logs invite.opened (firstOpen true, then false)', async () => {
    const info = vi.spyOn(logger, 'info').mockImplementation(() => {})
    const g = await makeGuest()
    expect(await recordInviteOpened(g.token, BROWSER_UA)).toBe('opened')
    const first = await openedAt(g.id)
    expect(first).not.toBeNull()
    expect(await recordInviteOpened(g.token, BROWSER_UA)).toBe('already_opened')
    expect((await openedAt(g.id))?.getTime()).toBe(first?.getTime())
    const events = info.mock.calls.map((c) => c[0] as { event?: string; firstOpen?: boolean; guestId?: string })
    expect(events.filter((e) => e.event === 'invite.opened')).toEqual([
      expect.objectContaining({ guestId: g.id, firstOpen: true }),
      expect.objectContaining({ guestId: g.id, firstOpen: false }),
    ])
  })

  it('ignores link-preview bots (extra guard on top of the client-only call)', async () => {
    const g = await makeGuest()
    expect(await recordInviteOpened(g.token, 'WhatsApp/2.23.20.0 A')).toBe('ignored')
    expect(await openedAt(g.id)).toBeNull()
  })

  it.each(['short', 'TesteE2E0000000000000X!', 'ZZZZZZZZZZZZZZZZZZZZZZ'])('ignores an invalid or unknown token (%s)', async (token) => {
    expect(await recordInviteOpened(token, BROWSER_UA)).toBe('ignored')
  })

  it('ignores a non-string token', async () => {
    expect(await recordInviteOpened(42 as unknown as string, BROWSER_UA)).toBe('ignored')
  })
})
