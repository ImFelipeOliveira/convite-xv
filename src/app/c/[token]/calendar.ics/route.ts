import { findGuestByToken } from '@/features/guests/repo'
import { inviteUrl } from '@/features/guests/whatsapp'
import { getClientIp, rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { generateIcs } from '@/features/event/ics'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const ip = getClientIp(request.headers)
  if (!rateLimit(`ics:${ip}`, { max: 60, windowMs: 60_000 }).ok) {
    logger.warn({ event: 'rate_limit.exceeded', route: 'calendar' }, 'rate limit exceeded')
    return new Response('Not found', { status: 404 })
  }
  const { token } = await params
  const guest = await findGuestByToken(token)
  if (!guest) return new Response('Not found', { status: 404 })

  const body = generateIcs({ name: guest.name, link: inviteUrl(token) })
  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="15-anos-isabella.ics"',
    },
  })
}
