import { createHash, timingSafeEqual } from 'node:crypto'
import { parseAsaasWebhook, processAsaasWebhook, warnWebhookNotConfigured } from '@/features/pix/webhook'
import { logger } from '@/lib/logger'
import { getClientIp, rateLimit } from '@/lib/rate-limit'

// Asaas webhook (configured in Asaas → Integrações → Webhooks; see README). Not under /admin, so the
// proxy never gates it: the `asaas-access-token` header is the authentication. Answers fast: the work is
// a couple of indexed queries in one transaction, plus (paid events only) one Asaas confirmation call of
// at most 8 s; 200 for everything handled (Asaas pauses the queue after repeated non-200 answers), 500
// only when the database failed or Asaas could not confirm (so Asaas retries). Rejected requests are
// rate limited per IP (429 past 30/min, unlogged).

const MAX_BODY_BYTES = 64 * 1024
/** Rejected requests (401/413/400) per client IP: past this, 429 without logging (no log flooding). */
const REJECTED_LIMIT = { max: 30, windowMs: 60_000 }
/** A wrong token is logged at warn once per IP per minute. */
const UNAUTHORIZED_LOG_LIMIT = { max: 1, windowMs: 60_000 }

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

function answer(status: number, reason: string) {
  return Response.json({ ok: false, error: reason }, { status })
}

/** A rejected request: counted per IP; over the limit it answers 429 and is not logged. */
function reject(ip: string, status: number, reason: string, log: boolean = true) {
  if (!rateLimit(`asaas-webhook-rejected:${ip}`, REJECTED_LIMIT).ok) return answer(429, 'rate_limited')
  if (log) logger.warn({ event: 'pix.webhook_rejected', reason }, 'pix webhook rejected')
  return answer(status, reason)
}

export async function POST(request: Request) {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN?.trim()
  if (!expected) {
    warnWebhookNotConfigured()
    return answer(503, 'not_configured')
  }
  const ip = getClientIp(request.headers)
  if (!tokenMatches(request.headers.get('asaas-access-token'), expected)) {
    const firstThisMinute = rateLimit(`asaas-webhook-401-log:${ip}`, UNAUTHORIZED_LOG_LIMIT).ok
    return reject(ip, 401, 'unauthorized', firstThisMinute)
  }

  const declared = Number(request.headers.get('content-length') ?? 0)
  const text = declared > MAX_BODY_BYTES ? null : await readCapped(request, MAX_BODY_BYTES)
  if (text === null) return reject(ip, 413, 'too_large')

  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    body = undefined
  }
  const evt = parseAsaasWebhook(body)
  if (!evt) return reject(ip, 400, 'malformed')

  try {
    const { duplicate } = await processAsaasWebhook(evt)
    return Response.json(duplicate ? { ok: true, duplicate: true } : { ok: true })
  } catch (err) {
    logger.error({ event: 'pix.webhook_failed', eventId: evt.id, err }, 'pix webhook failed')
    return answer(500, 'internal')
  }
}
