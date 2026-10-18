import { createHash, timingSafeEqual } from 'node:crypto'
import { parseAsaasWebhook, processAsaasWebhook, warnWebhookNotConfigured } from '@/features/pix/webhook'
import { logger } from '@/lib/logger'

// Asaas webhook (configured in Asaas → Integrações → Webhooks; see README). Not under /admin, so the
// proxy never gates it: the `asaas-access-token` header is the authentication. Answers fast: the work is
// a couple of indexed queries in one transaction; 200 for everything handled (Asaas pauses the queue
// after repeated non-200 answers), 500 only when the database failed (so Asaas retries).

const MAX_BODY_BYTES = 64 * 1024

/** Constant-time compare: both sides hashed to 32 bytes first, so lengths never leak through timing. */
function tokenMatches(given: string | null, expected: string): boolean {
  if (given === null) return false
  const a = createHash('sha256').update(given).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}

/** The body as text, or null once it exceeds `max` bytes (stops reading there). */
async function readCapped(request: Request, max: number): Promise<string | null> {
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) {
      await reader.cancel().catch(() => {})
      return null
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function reject(status: number, reason: string) {
  return Response.json({ ok: false, error: reason }, { status })
}

export async function POST(request: Request) {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN?.trim()
  if (!expected) {
    warnWebhookNotConfigured()
    return reject(503, 'not_configured')
  }
  if (!tokenMatches(request.headers.get('asaas-access-token'), expected)) {
    logger.warn({ event: 'pix.webhook_rejected', reason: 'unauthorized' }, 'pix webhook rejected')
    return reject(401, 'unauthorized')
  }

  const declared = Number(request.headers.get('content-length') ?? 0)
  const text = declared > MAX_BODY_BYTES ? null : await readCapped(request, MAX_BODY_BYTES)
  if (text === null) {
    logger.warn({ event: 'pix.webhook_rejected', reason: 'too_large' }, 'pix webhook rejected')
    return reject(413, 'too_large')
  }

  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    body = undefined
  }
  const evt = parseAsaasWebhook(body)
  if (!evt) {
    logger.warn({ event: 'pix.webhook_rejected', reason: 'malformed' }, 'pix webhook rejected')
    return reject(400, 'malformed')
  }

  try {
    const { duplicate } = await processAsaasWebhook(evt)
    return Response.json(duplicate ? { ok: true, duplicate: true } : { ok: true })
  } catch (err) {
    logger.error({ event: 'pix.webhook_failed', eventId: evt.id, err }, 'pix webhook failed')
    return reject(500, 'internal')
  }
}
