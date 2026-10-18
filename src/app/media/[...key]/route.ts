import { isGiftImageKey } from '@/features/media/keys'
import { getStorage } from '@/features/media/storage'
import { logger } from '@/lib/logger'

// Public reads of uploaded gift photos (the bucket is private). Only well-formed keys are looked up;
// the names are random UUIDs and never change (a new photo gets a new key), so caching is immutable.
export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const key = (await params).key.join('/')
  if (!isGiftImageKey(key)) return new Response('Not found', { status: 404 })

  let object
  try {
    object = await getStorage().get(key)
  } catch (err) {
    logger.error({ event: 'media.read_failed', key, err }, 'media read failed')
    return new Response('Unavailable', { status: 503 })
  }
  if (!object) return new Response('Not found', { status: 404 })

  const headers = new Headers({
    'Content-Type': 'image/webp',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
  })
  if (object.contentLength !== undefined) headers.set('Content-Length', String(object.contentLength))
  const body = Buffer.isBuffer(object.body) ? new Uint8Array(object.body) : object.body
  return new Response(body, { headers })
}
