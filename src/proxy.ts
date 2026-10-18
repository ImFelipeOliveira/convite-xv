import { NextResponse, type NextRequest } from 'next/server'
import { findGuestByToken } from '@/features/guests/repo'
import { getClientIp, rateLimit } from '@/lib/rate-limit'

// With Cache Components the invite page streams its shell before the guest lookup finishes,
// so notFound() in the page can no longer change the status. Checking here keeps a real 404
// for unknown tokens and rate-limited clients (Next's recommended pattern for 404 status).
const NO_SUCH_ROUTE = '/invite-not-found'

export async function proxy(request: NextRequest) {
  const notFound = () => NextResponse.rewrite(new URL(NO_SUCH_ROUTE, request.url))

  if (!rateLimit(`invite:${getClientIp(request.headers)}`, { max: 60, windowMs: 60_000 }).ok) {
    return notFound()
  }
  const token = request.nextUrl.pathname.split('/')[2] ?? ''
  if (!(await findGuestByToken(token))) return notFound()
  return NextResponse.next()
}

export const config = {
  matcher: '/c/:token',
}
