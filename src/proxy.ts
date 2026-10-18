import { NextResponse, type NextRequest } from 'next/server'
import {
  readSessionToken,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  shouldRenewSession,
  signSessionToken,
} from '@/features/admin-auth/session'
import { findGuestByToken } from '@/features/guests/repo'
import { logger } from '@/lib/logger'
import { getClientIp, rateLimit } from '@/lib/rate-limit'

// With Cache Components the invite page streams its shell before the guest lookup finishes,
// so notFound() in the page can no longer change the status. Checking here keeps a real 404
// for unknown tokens and rate-limited clients (Next's recommended pattern for 404 status).
const NO_SUCH_ROUTE = '/invite-not-found'
const PAGE_LIMIT = { max: 60, windowMs: 60_000 }
const ACTION_LIMIT = { max: 600, windowMs: 60_000 }

// Admin gate: pages render in parallel with layouts and layouts don't re-run on client navigation,
// so the session is checked here for every /admin path. requireAdmin in pages/actions stays the real check.
async function guardAdmin(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (pathname === '/admin/login') return NextResponse.next()
  const token = request.cookies.get(SESSION_COOKIE)?.value
  const session = token ? await readSessionToken(token) : null
  if (!session) return NextResponse.redirect(new URL('/admin/login', request.url))
  const res = NextResponse.next()
  // sliding session: an admin who keeps using the panel never hits the 30-day expiry mid-task
  // (until 90 days after the password sign-in: authAt is carried over, then the cookie just expires)
  if (shouldRenewSession(session.issuedAt, Math.floor(Date.now() / 1000), session.authAt)) {
    const authAt = session.authAt ?? session.issuedAt
    res.cookies.set(SESSION_COOKIE, await signSessionToken(session.adminId, authAt), SESSION_COOKIE_OPTIONS)
  }
  return res
}

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/admin')) return guardAdmin(request)
  const notFound = () => NextResponse.rewrite(new URL(NO_SUCH_ROUTE, request.url))

  // a rate-limited client intentionally gets the same 404 as an unknown token (no enumeration signal)
  const ip = getClientIp(request.headers)
  // Server Action POSTs (the Pix status poll every 5 s, RSVP, gifts) post to /c/:token too. They never
  // count toward the page-load limit, or a few open QRs behind one shared IP (mobile CGNAT) would 404
  // other guests' invites; each action has its own limit. A roomy per-IP bucket still caps token lookups.
  const isAction = request.method === 'POST' && request.headers.has('next-action')
  const [bucket, limit] = isAction ? [`invite-action:${ip}`, ACTION_LIMIT] : [`invite:${ip}`, PAGE_LIMIT]
  if (!rateLimit(bucket, limit).ok) {
    logger.warn({ event: 'rate_limit.exceeded', route: isAction ? 'invite-action' : 'invite' }, 'rate limit exceeded')
    return notFound()
  }
  const token = request.nextUrl.pathname.split('/')[2] ?? ''
  if (!(await findGuestByToken(token))) return notFound()
  return NextResponse.next()
}

export const config = {
  matcher: ['/c/:token', '/admin/:path*'],
}
