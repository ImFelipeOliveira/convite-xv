import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { db } from '@/server/db/client'
import { admins, messageDispatches } from '@/server/db/schema'
import { makeGuest } from '../../../../tests/helpers/db'
import type { EvolutionConfig } from '../config'
import type { sendText } from '../evolution'
import { sendInvite } from '../invite'

// failures injected into the dispatch repo (real DB otherwise)
const fail = vi.hoisted(() => ({ sent: 0, failed: 0 }))
vi.mock('../dispatches', async (importOriginal) => {
  const real = await importOriginal<typeof import('../dispatches')>()
  return {
    ...real,
    markDispatchSent: async (...args: Parameters<typeof real.markDispatchSent>) => {
      if (fail.sent > 0) {
        fail.sent--
        throw new Error('db hiccup')
      }
      return real.markDispatchSent(...args)
    },
    markDispatchFailed: async (...args: Parameters<typeof real.markDispatchFailed>) => {
      if (fail.failed > 0) {
        fail.failed--
        throw new Error('db hiccup')
      }
      return real.markDispatchFailed(...args)
    },
  }
})

async function adminId() {
  const [a] = await db.insert(admins).values({ email: `a${Math.random()}@x.com`, passwordHash: 'x' }).returning()
  return a.id
}

const CFG: EvolutionConfig = { url: 'http://evolution.test', apiKey: 'k', instance: 'convite-xv' }
const deps = (r: Awaited<ReturnType<typeof sendText>>) => ({
  sendText: vi.fn<typeof sendText>(async () => r),
  readEvolutionConfig: () => CFG,
})

describe('sendInvite recording failures', () => {
  it('retries markDispatchSent once and reports the DB sentAt', async () => {
    fail.sent = 1
    const g = await makeGuest({ phone: '+5595991234567' })
    const r = await sendInvite(g.id, await adminId(), deps({ ok: true, value: { messageId: 'M' } }))
    expect(r.ok).toBe(true)
    const [row] = await db.select().from(messageDispatches).where(eq(messageDispatches.guestId, g.id))
    expect(row.status).toBe('sent')
    if (r.ok) expect(r.sentAt).toBe(row.sentAt!.toISOString())
  })

  it('still reports success when recording keeps failing (provider accepted it)', async () => {
    fail.sent = 2
    const g = await makeGuest({ phone: '+5595991234567' })
    const r = await sendInvite(g.id, await adminId(), deps({ ok: true, value: { messageId: 'M' } }))
    expect(r.ok).toBe(true)
    if (r.ok) expect(Number.isNaN(new Date(r.sentAt).getTime())).toBe(false)
  })

  it('returns the mapped provider error even if recording the failure throws', async () => {
    fail.failed = 1
    const g = await makeGuest({ phone: '+5595991234567' })
    expect(
      await sendInvite(g.id, await adminId(), deps({ ok: false, error: 'invalid_number' })),
    ).toEqual({ ok: false, error: 'invalid_number' })
  })
})
