import { inspect } from 'node:util'
import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { db } from '@/server/db/client'
import { guests } from '@/server/db/schema'
import { makeGuest } from '../../../../tests/helpers/db'

/** Everything Next's console.error (util.inspect), String(err) or a stack dump would print. */
function printed(err: unknown): string {
  const e = err as Error
  return [inspect(err, { depth: 10 }), String(err), e.stack ?? '', inspect(e.cause, { depth: 10, showHidden: true })].join(
    '\n',
  )
}

async function caught(p: Promise<unknown>): Promise<unknown> {
  try {
    await p
  } catch (err) {
    return err
  }
  throw new Error('expected the query to fail')
}

describe('database errors never carry parameter values', () => {
  it('a failed select (bad input syntax echoes the value) keeps the code but no params', async () => {
    const secret = 'Tok3nSecret-+5595991234567'
    const err = await caught(db.select().from(guests).where(eq(guests.id, secret)))
    const out = printed(err)
    expect(out).not.toContain(secret)
    expect(out).not.toContain('5595991234567')
    expect(out).toContain('select') // the SQL text (placeholders only) stays for debugging
    expect((err as { cause?: { code?: string } }).cause?.code).toBe('22P02')
  })

  it('a unique violation (detail echoes the key) keeps code 23505 but no token in the output', async () => {
    const g = await makeGuest({ phone: '+5595991112233' })
    const err = await caught(db.insert(guests).values({ token: g.token, name: 'Maria Secreta', plusOnesLimit: 0 }))
    const out = printed(err)
    expect(out).not.toContain(g.token)
    expect(out).not.toContain('Maria Secreta')
    expect((err as { cause?: { code?: string } }).cause?.code).toBe('23505')
  })

  it('inside a transaction too, and what console.error prints is clean', async () => {
    const secret = '+5595998887766'
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const err = await caught(
        db.transaction(async (tx) => {
          await tx.update(guests).set({ phone: secret }).where(eq(guests.id, `not-a-uuid ${secret}`))
        }),
      )
      console.error(err) // what Next does with an uncaught render error
      const logged = spy.mock.calls.map((args) => args.map((a) => inspect(a, { depth: 10 })).join(' ')).join('\n')
      expect(logged).not.toContain(secret)
      expect(logged).not.toContain('params:')
    } finally {
      spy.mockRestore()
    }
  })
})
