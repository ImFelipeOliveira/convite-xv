import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetRateLimits } from '@/lib/rate-limit'
import { makeGuest } from '../../tests/helpers/db'
import { proxy } from '../proxy'

const IP = '203.0.113.7'

function invite(token: string, init: { method?: string; action?: boolean } = {}) {
  const headers = new Headers({ 'x-real-ip': IP })
  if (init.action) headers.set('next-action', 'abc123')
  return new NextRequest(`http://localhost/c/${token}`, { method: init.method ?? 'GET', headers })
}

function isNotFound(res: Response): boolean {
  return (res.headers.get('x-middleware-rewrite') ?? '').endsWith('/invite-not-found')
}

beforeEach(() => resetRateLimits())

describe('proxy (invite)', () => {
  it('passes a known token and rewrites an unknown one to the 404 page', async () => {
    const g = await makeGuest()
    expect(isNotFound(await proxy(invite(g.token)))).toBe(false)
    expect(isNotFound(await proxy(invite('nope')))).toBe(true)
  })

  it('rate limits page loads per IP (300/min, room for a party behind one Wi-Fi) with the same 404', async () => {
    const g = await makeGuest()
    for (let i = 0; i < 300; i++) expect(isNotFound(await proxy(invite(g.token)))).toBe(false)
    expect(isNotFound(await proxy(invite(g.token)))).toBe(true)
  })

  it('Server Action POSTs (Pix status poll) never count toward the per-IP page limit', async () => {
    const g = await makeGuest()
    // more action POSTs from one IP than the page limit allows
    for (let i = 0; i < 301; i++) {
      expect(isNotFound(await proxy(invite(g.token, { method: 'POST', action: true })))).toBe(false)
    }
    // page loads from that IP are still fine
    expect(isNotFound(await proxy(invite(g.token)))).toBe(false)
  })

  it('a plain POST without Next-Action still counts as a page request', async () => {
    const g = await makeGuest()
    for (let i = 0; i < 300; i++) await proxy(invite(g.token, { method: 'POST' }))
    expect(isNotFound(await proxy(invite(g.token)))).toBe(true)
  })

  it('still rejects a Server Action POST to an unknown token', async () => {
    expect(isNotFound(await proxy(invite('nope', { method: 'POST', action: true })))).toBe(true)
  })
})

describe('proxy (invite actions backstop)', () => {
  it('caps Server Action POSTs per IP at a roomy 600/min', async () => {
    const g = await makeGuest()
    for (let i = 0; i < 600; i++) await proxy(invite(g.token, { method: 'POST', action: true }))
    expect(isNotFound(await proxy(invite(g.token, { method: 'POST', action: true })))).toBe(true)
    // the page-load bucket is separate
    expect(isNotFound(await proxy(invite(g.token)))).toBe(false)
  })
})
