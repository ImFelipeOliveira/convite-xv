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

describe('getClientIp', () => {
  it('takes the first x-forwarded-for IP', () => {
    const h = new Headers({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2' })
    expect(getClientIp(h)).toBe('1.1.1.1')
  })

  it("falls back to 'local'", () => {
    expect(getClientIp(new Headers())).toBe('local')
  })
})
