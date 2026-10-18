import { SignJWT } from 'jose'
import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from '../password'
import { readSessionToken, shouldRenewSession, signSessionToken, verifySessionToken } from '../session'

describe('password', () => {
  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('abc')
    expect(await verifyPassword('abc', hash)).toBe(true)
    expect(await verifyPassword('abd', hash)).toBe(false)
  })
})

describe('session token', () => {
  it('round-trips an admin id', async () => {
    const jwt = await signSessionToken('admin-1')
    expect(await verifySessionToken(jwt)).toEqual({ adminId: 'admin-1' })
  })

  it('rejects a tampered token', async () => {
    const jwt = await signSessionToken('admin-1')
    const [h, p, s] = jwt.split('.')
    const forgedPayload = Buffer.from(JSON.stringify({ sub: 'admin-2', exp: 9999999999 })).toString('base64url')
    expect(await verifySessionToken(`${h}.${forgedPayload}.${s}`)).toBeNull()
    expect(await verifySessionToken(`${h}.${p}.${s.slice(0, -2)}xx`)).toBeNull()
    expect(await verifySessionToken('garbage')).toBeNull()
  })

  it('rejects alg none and HS512 tokens', async () => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
    const none = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: 'a', exp: 9999999999 })}.`
    expect(await verifySessionToken(none)).toBeNull()
    const hs512 = await new SignJWT({}).setProtectedHeader({ alg: 'HS512' }).setSubject('a')
      .setExpirationTime('30d').sign(new TextEncoder().encode(process.env.AUTH_SECRET))
    expect(await verifySessionToken(hs512)).toBeNull()
  })

  it('rejects a token signed with another secret and an expired token', async () => {
    const other = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject('a')
      .setExpirationTime('30d').sign(new TextEncoder().encode('x'.repeat(40)))
    expect(await verifySessionToken(other)).toBeNull()
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET)
    const expired = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject('a')
      .setExpirationTime(Math.floor(Date.now() / 1000) - 10).sign(secret)
    expect(await verifySessionToken(expired)).toBeNull()
  })
})

describe('sliding session renewal', () => {
  const DAY = 24 * 60 * 60
  it('renews only once the token is at least 24 h old', () => {
    const now = 1_800_000_000
    expect(shouldRenewSession(now, now)).toBe(false)
    expect(shouldRenewSession(now - DAY + 1, now)).toBe(false)
    expect(shouldRenewSession(now - DAY, now)).toBe(true)
    expect(shouldRenewSession(now - 20 * DAY, now)).toBe(true)
  })

  it('stops renewing 90 days after the password sign-in (authAt)', () => {
    const now = 1_800_000_000
    expect(shouldRenewSession(now - 2 * DAY, now, now - 89 * DAY)).toBe(true)
    expect(shouldRenewSession(now - 2 * DAY, now, now - 90 * DAY)).toBe(false)
    // tokens without authAt count from their own iat
    expect(shouldRenewSession(now - 2 * DAY, now)).toBe(true)
    expect(shouldRenewSession(now - 91 * DAY, now)).toBe(false)
  })

  it('does not renew without a usable iat', () => {
    expect(shouldRenewSession(undefined, 1_800_000_000)).toBe(false)
    expect(shouldRenewSession(Number.NaN, 1_800_000_000)).toBe(false)
  })

  it('exposes the issued-at of a valid token', async () => {
    const before = Math.floor(Date.now() / 1000)
    const claims = await readSessionToken(await signSessionToken('admin-1'))
    expect(claims?.adminId).toBe('admin-1')
    expect(claims?.issuedAt).toBeGreaterThanOrEqual(before)
    expect(claims?.authAt).toBe(claims?.issuedAt)
  })

  it('keeps the original authAt when a session is re-issued', async () => {
    const claims = await readSessionToken(await signSessionToken('admin-1', 1_700_000_000))
    expect(claims?.authAt).toBe(1_700_000_000)
  })
})
