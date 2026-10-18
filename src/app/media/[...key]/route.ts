import { isMediaKey, mediaContentType } from '@/features/media/keys'
import { parseRangeHeader, RangeNotSatisfiableError } from '@/features/media/range'
import { getStorage, type StoredObject } from '@/features/media/storage'
import { logger } from '@/lib/logger'
import { getClientIp, rateLimit } from '@/lib/rate-limit'

// Public reads of uploaded media (gift photos, the invite music; the bucket is private). Only well-formed
// keys are looked up; the names are random UUIDs and never change (a new upload gets a new key), so
// caching is immutable. Single byte ranges are honored (206): iOS Safari needs them to play audio.

const IMMUTABLE = 'public, max-age=31536000, immutable'

function baseHeaders(key: string): Headers {
  return new Headers({
    // from the key, never from storage metadata: only the types our own keys allow are ever served
    'Content-Type': mediaContentType(key),
    'Cache-Control': IMMUTABLE,
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
    // opened directly, the response can't run or load anything, nor be framed
    'Content-Security-Policy': "default-src 'none'; sandbox; frame-ancestors 'none'",
  })
}

export async function GET(request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  // every well-formed key costs a bucket read, even a missing one: cap each client first
  if (!rateLimit(`media:${getClientIp(request.headers)}`, { max: 300, windowMs: 60_000 }).ok) {
    logger.warn({ event: 'rate_limit.exceeded', route: 'media' }, 'rate limit exceeded')
    return new Response('Too many requests', { status: 429, headers: { 'Retry-After': '60' } })
  }
  const key = (await params).key.join('/')
  if (!isMediaKey(key)) return new Response('Not found', { status: 404 })

  const range = parseRangeHeader(request.headers.get('range'))
  let object: StoredObject | null
  try {
    object = await getStorage().get(key, range ?? undefined)
  } catch (err) {
    if (err instanceof RangeNotSatisfiableError) {
      const headers = baseHeaders(key)
      headers.set('Content-Range', `bytes */${err.size ?? '*'}`)
      return new Response(null, { status: 416, headers })
    }
    logger.error({ event: 'media.read_failed', key, err }, 'media read failed')
    return new Response('Unavailable', { status: 503 })
  }
  if (!object) return new Response('Not found', { status: 404 })

  const headers = baseHeaders(key)
  if (object.contentLength !== undefined) headers.set('Content-Length', String(object.contentLength))
  const body = Buffer.isBuffer(object.body) ? new Uint8Array(object.body) : object.body
  if (object.range) {
    headers.set('Content-Range', `bytes ${object.range.start}-${object.range.end}/${object.size ?? '*'}`)
    return new Response(body, { status: 206, headers })
  }
  return new Response(body, { headers })
}
