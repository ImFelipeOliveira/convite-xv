import { jwtVerify, SignJWT } from 'jose'
import { cookies } from 'next/headers'

export const SESSION_COOKIE = 'xv_admin'
const SESSION_DAYS = 30
/** A valid session older than this gets a fresh 30-day cookie on the next admin request (sliding). */
export const SESSION_RENEW_AFTER_SECONDS = 24 * 60 * 60
/** Absolute lifetime: no renewal 90 days after the password sign-in (`authAt`); normal expiry then applies. */
export const SESSION_MAX_AGE_FROM_AUTH_SECONDS = 90 * 24 * 60 * 60

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
  maxAge: SESSION_DAYS * 24 * 60 * 60,
} as const

const isTime = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

/**
 * Sliding renewal: re-issue when the token was issued at least 24 h ago, unless the sign-in (`authAt`)
 * is 90+ days old. All values in seconds; tokens from before `authAt` existed count from their `iat`.
 */
export function shouldRenewSession(issuedAt: number | undefined, nowSeconds: number, authAt?: number): boolean {
  if (!isTime(issuedAt)) return false
  const signedInAt = isTime(authAt) ? authAt : issuedAt
  if (nowSeconds - signedInAt >= SESSION_MAX_AGE_FROM_AUTH_SECONDS) return false
  return nowSeconds - issuedAt >= SESSION_RENEW_AFTER_SECONDS
}
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

/** `authAt` (seconds): when the admin signed in with the password; kept as-is by renewals. */
export function signSessionToken(adminId: string, authAt = Math.floor(Date.now() / 1000)): Promise<string> {
  return new SignJWT({ authAt })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(adminId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(getSecret())
}

/** Verified claims of a session JWT (admin id + issued-at, seconds), or null if invalid/forged/expired. */
export async function readSessionToken(
  token: string,
): Promise<{ adminId: string; issuedAt?: number; authAt?: number } | null> {
  const secret = getSecret() // outside the try: a misconfigured deploy must fail loudly
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] })
    if (!payload.sub) return null
    const authAt = isTime(payload.authAt) ? payload.authAt : undefined
    return { adminId: payload.sub, issuedAt: payload.iat, authAt }
  } catch {
    return null
  }
}

/** Pure check of a session JWT: the admin id, or null for anything invalid, forged or expired. */
export async function verifySessionToken(token: string): Promise<{ adminId: string } | null> {
  const claims = await readSessionToken(token)
  return claims ? { adminId: claims.adminId } : null
}

export async function createSession(adminId: string): Promise<void> {
  const store = await cookies()
  store.set(SESSION_COOKIE, await signSessionToken(adminId), SESSION_COOKIE_OPTIONS)
}

export async function getSession(): Promise<{ adminId: string } | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  return token ? verifySessionToken(token) : null
}

export async function destroySession(): Promise<void> {
  ;(await cookies()).delete(SESSION_COOKIE)
}
