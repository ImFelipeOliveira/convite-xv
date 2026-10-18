import { SignJWT } from 'jose'
import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from '../password'
import { signSessionToken, verifySessionToken } from '../session'

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
