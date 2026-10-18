import type { EvolutionConfig } from './config'

export type EvolutionError =
  | 'not_configured'
  | 'not_connected'
  | 'invalid_number'
  | 'timeout'
  | 'unauthorized'
  | 'provider_error'

export type EvolutionResult<T> = { ok: true; value: T } | { ok: false; error: EvolutionError }

type FetchImpl = typeof fetch
type Raw = { status: number; text: string; body: unknown }
type Called = { ok: true; raw: Raw } | { ok: false; error: EvolutionError }

const TIMEOUT_MS = 15_000

async function call(
  cfg: EvolutionConfig,
  method: string,
  path: string,
  payload: unknown,
  fetchImpl: FetchImpl,
): Promise<Called> {
  try {
    const res = await fetchImpl(`${cfg.url}${path}`, {
      method,
      headers: { apikey: cfg.apiKey, 'content-type': 'application/json' },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const text = await res.text().catch(() => '')
    let body: unknown = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      body = null
    }
    return { ok: true, raw: { status: res.status, text, body } }
  } catch (err) {
    const name = (err as { name?: string } | null)?.name
    if (name === 'TimeoutError' || name === 'AbortError') return { ok: false, error: 'timeout' }
    return { ok: false, error: 'provider_error' }
  }
}

function isSuccess(raw: Raw): boolean {
  return raw.status >= 200 && raw.status < 300
}

function mapFailure(raw: Raw, opts: { send?: boolean } = {}): EvolutionError {
  if (raw.status === 401 || raw.status === 403) return 'unauthorized'
  if (opts.send) {
    const text = raw.text
    if (/connection closed/i.test(text)) return 'not_connected'
    if (raw.status === 400 && saysNumberDoesNotExist(raw.body)) return 'invalid_number'
  }
  return 'provider_error'
}

/** Evolution's explicit "no WhatsApp on this number" answer: `response.message[]` with `exists: false`. */
function saysNumberDoesNotExist(body: unknown): boolean {
  const message = pick(body, 'response', 'message')
  return (
    Array.isArray(message) &&
    message.some((m) => m !== null && typeof m === 'object' && (m as { exists?: unknown }).exists === false)
  )
}

function fail<T>(error: EvolutionError): EvolutionResult<T> {
  return { ok: false, error }
}

function pick(body: unknown, ...keys: string[]): unknown {
  let cur: unknown = body
  for (const k of keys) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[k]
  }
  return cur
}

export async function getConnectionState(
  cfg: EvolutionConfig,
  fetchImpl: FetchImpl = fetch,
): Promise<EvolutionResult<'open' | 'connecting' | 'close'>> {
  const r = await call(cfg, 'GET', `/instance/connectionState/${cfg.instance}`, undefined, fetchImpl)
  if (!r.ok) return fail(r.error)
  if (r.raw.status === 404) return { ok: true, value: 'close' }
  if (!isSuccess(r.raw)) return fail(mapFailure(r.raw))
  const state = pick(r.raw.body, 'instance', 'state')
  if (state === 'open' || state === 'connecting') return { ok: true, value: state }
  return { ok: true, value: 'close' }
}

export async function connectQr(
  cfg: EvolutionConfig,
  fetchImpl: FetchImpl = fetch,
): Promise<EvolutionResult<{ qrDataUrl: string | null }>> {
  const created = await call(
    cfg,
    'POST',
    '/instance/create',
    { instanceName: cfg.instance, integration: 'WHATSAPP-BAILEYS', qrcode: true },
    fetchImpl,
  )
  if (!created.ok) return fail(created.error)
  const c = created.raw
  // 403/409 on create means the instance already exists, which is fine.
  if (!isSuccess(c) && c.status !== 403 && c.status !== 409) {
    return fail(c.status === 401 ? 'unauthorized' : 'provider_error')
  }
  return fetchQr(cfg, fetchImpl)
}

/**
 * GET /instance/connect only (the instance must exist): starts pairing when closed and answers the
 * current QR while connecting (WhatsApp rotates it every ~20 s). `null` = connected or not ready yet.
 */
export async function fetchQr(
  cfg: EvolutionConfig,
  fetchImpl: FetchImpl = fetch,
): Promise<EvolutionResult<{ qrDataUrl: string | null }>> {
  const r = await call(cfg, 'GET', `/instance/connect/${cfg.instance}`, undefined, fetchImpl)
  if (!r.ok) return fail(r.error)
  if (!isSuccess(r.raw)) return fail(mapFailure(r.raw))
  return { ok: true, value: { qrDataUrl: toQrDataUrl(r.raw.body) } }
}

/**
 * The QR image from a connect answer. Evolution v2 sends `base64` either as a full data URL or as
 * raw base64 (sometimes nested under `qrcode`); `code`/`pairingCode`/`count` alone mean no image yet.
 */
const PNG_DATA_URL = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/
const BASE64 = /^[A-Za-z0-9+/=]+$/

function toQrDataUrl(body: unknown): string | null {
  const raw = pick(body, 'base64') ?? pick(body, 'qrcode', 'base64')
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  if (!value) return null
  // only a PNG data URL ever reaches the <img src>: anything else (other schemes/types) is dropped
  if (PNG_DATA_URL.test(value)) return value
  const raw64 = value.replace(/\s/g, '')
  return BASE64.test(raw64) ? `data:image/png;base64,${raw64}` : null
}

export async function logout(
  cfg: EvolutionConfig,
  fetchImpl: FetchImpl = fetch,
): Promise<EvolutionResult<void>> {
  const r = await call(cfg, 'DELETE', `/instance/logout/${cfg.instance}`, undefined, fetchImpl)
  if (!r.ok) return fail(r.error)
  if (!isSuccess(r.raw)) return fail(mapFailure(r.raw))
  return { ok: true, value: undefined }
}

export async function sendText(
  cfg: EvolutionConfig,
  input: { phoneE164: string; text: string },
  fetchImpl: FetchImpl = fetch,
): Promise<EvolutionResult<{ messageId: string | null }>> {
  const r = await call(
    cfg,
    'POST',
    `/message/sendText/${cfg.instance}`,
    { number: input.phoneE164.replace(/\D/g, ''), text: input.text, linkPreview: true },
    fetchImpl,
  )
  if (!r.ok) return fail(r.error)
  if (!isSuccess(r.raw)) return fail(mapFailure(r.raw, { send: true }))
  const id = pick(r.raw.body, 'key', 'id')
  return { ok: true, value: { messageId: typeof id === 'string' ? id : null } }
}
