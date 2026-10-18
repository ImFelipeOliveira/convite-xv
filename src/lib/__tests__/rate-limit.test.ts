import { beforeEach, describe, expect, it } from 'vitest'
import { getClientIp, rateLimit, resetRateLimits } from '../rate-limit'

describe('rateLimit', () => {
  beforeEach(() => resetRateLimits())

  it('allows up to max calls then blocks', () => {
    const opts = { max: 3, windowMs: 1000 }
    expect(rateLimit('a', opts, 0).ok).toBe(true)
    expect(rateLimit('a', opts, 1).ok).toBe(true)
    expect(rateLimit('a', opts, 2)).toEqual({ ok: true, remaining: 0 })
    expect(rateLimit('a', opts, 3)).toEqual({ ok: false, remaining: 0 })
  })

  it('allows again after the window passes', () => {
    const opts = { max: 1, windowMs: 1000 }
    expect(rateLimit('a', opts, 0).ok).toBe(true)
    expect(rateLimit('a', opts, 500).ok).toBe(false)
    expect(rateLimit('a', opts, 1001).ok).toBe(true)
  })

  it('keeps different keys independent', () => {
    const opts = { max: 1, windowMs: 1000 }
    expect(rateLimit('a', opts, 0).ok).toBe(true)
    expect(rateLimit('b', opts, 0).ok).toBe(true)
    expect(rateLimit('a', opts, 1).ok).toBe(false)
  })
})

describe('rateLimit with mixed windows', () => {
  beforeEach(() => resetRateLimits())

  it('keeps a long-window key blocked when a short-window call prunes later', () => {
    const login = { max: 5, windowMs: 15 * 60_000 }
    for (let i = 0; i < 5; i++) expect(rateLimit('admin-login:ip', login, i).ok).toBe(true)
    expect(rateLimit('admin-login:ip', login, 10).ok).toBe(false)
    expect(rateLimit('ics:ip', { max: 60, windowMs: 60_000 }, 61_000).ok).toBe(true)
    expect(rateLimit('admin-login:ip', login, 62_000).ok).toBe(false)
  })
})

describe('getClientIp', () => {
  it('takes the right-most (proxy-appended) x-forwarded-for IP', () => {
    const h = new Headers({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2' })
    expect(getClientIp(h)).toBe('2.2.2.2')
  })

  it('prefers x-real-ip when present', () => {
    const h = new Headers({ 'x-real-ip': '9.9.9.9', 'x-forwarded-for': '1.1.1.1, 2.2.2.2' })
    expect(getClientIp(h)).toBe('9.9.9.9')
  })

  it("falls back to 'local'", () => {
    expect(getClientIp(new Headers())).toBe('local')
  })
})
