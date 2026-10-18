import { findGuestByToken } from '@/features/guests/repo'
import { getClientIp, rateLimit } from '@/lib/rate-limit'
import { generateIcs } from '@/features/event/ics'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const ip = getClientIp(request.headers)
  if (!rateLimit(`ics:${ip}`, { max: 60, windowMs: 60_000 }).ok) {
    return new Response('Not found', { status: 404 })
  }
  const { token } = await params
  const guest = await findGuestByToken(token)
  if (!guest) return new Response('Not found', { status: 404 })

  const body = generateIcs({ name: guest.name, link: `${process.env.APP_URL}/c/${token}` })
  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="xv-isabella.ics"',
    },
  })
}
