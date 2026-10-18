import { jwtVerify, SignJWT } from 'jose'
import { cookies } from 'next/headers'

export const SESSION_COOKIE = 'xv_admin'
const SESSION_DAYS = 30
const MIN_SECRET_LENGTH = 32

function getSecret(): Uint8Array {
  const raw = process.env.AUTH_SECRET?.trim()
  if (!raw || raw.length < MIN_SECRET_LENGTH) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`AUTH_SECRET is missing or shorter than ${MIN_SECRET_LENGTH} characters (required in production)`)
    }
    if (!raw) throw new Error('AUTH_SECRET is not set (add it to .env.local)')
  }
  return new TextEncoder().encode(raw)
}

export function signSessionToken(adminId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(adminId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(getSecret())
}

/** Pure check of a session JWT: the admin id, or null for anything invalid, forged or expired. */
export async function verifySessionToken(token: string): Promise<{ adminId: string } | null> {
  const secret = getSecret() // outside the try: a misconfigured deploy must fail loudly
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] })
    return payload.sub ? { adminId: payload.sub } : null
  } catch {
    return null
  }
}

export async function createSession(adminId: string): Promise<void> {
  const store = await cookies()
  store.set(SESSION_COOKIE, await signSessionToken(adminId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  })
}

export async function getSession(): Promise<{ adminId: string } | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  return token ? verifySessionToken(token) : null
}

export async function destroySession(): Promise<void> {
  ;(await cookies()).delete(SESSION_COOKIE)
}
