import { describe, expect, it } from 'vitest'
import { generateToken, isValidToken } from '../token'

describe('token', () => {
  it('generates 22 base62 chars', () => {
    expect(generateToken()).toMatch(/^[0-9A-Za-z]{22}$/)
  })
  it('generates 1000 unique tokens', () => {
    const set = new Set(Array.from({ length: 1000 }, generateToken))
    expect(set.size).toBe(1000)
  })
  it('rejects short tokens', () => {
    expect(isValidToken('abc')).toBe(false)
  })
  it('rejects path-like tokens of the right length', () => {
    expect(isValidToken('../admin' + 'x'.repeat(14))).toBe(false)
  })
  it('accepts a generated token', () => {
    expect(isValidToken(generateToken())).toBe(true)
  })
})
