import type { PixStatus } from '@/server/db/schema'
import type { AsaasConfig } from './config'

export type AsaasError = 'not_configured' | 'timeout' | 'unauthorized' | 'invalid_request' | 'provider_error'

export type AsaasResult<T> = { ok: true; value: T } | { ok: false; error: AsaasError }

type FetchImpl = typeof fetch
type Raw = { status: number; body: unknown }

const TIMEOUT_MS = 15_000
const USER_AGENT = 'convite-xv'

/** One HTTP call; never throws. A 2xx with a non-JSON body counts as a provider error. */
async function call(
  cfg: AsaasConfig,
  method: string,
  path: string,
  payload: unknown,
  fetchImpl: FetchImpl,
  timeoutMs: number = TIMEOUT_MS,
): Promise<AsaasResult<unknown>> {
  let raw: Raw
  try {
    const res = await fetchImpl(`${cfg.baseUrl}${path}`, {
      method,
      headers: {
        access_token: cfg.apiKey,
        'user-agent': USER_AGENT,
        'content-type': 'application/json',
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    })
    const text = await res.text().catch(() => '')
    let body: unknown = undefined
    try {
      body = text ? JSON.parse(text) : undefined
    } catch {
      body = undefined
    }
    raw = { status: res.status, body }
  } catch (err) {
    const name = (err as { name?: string } | null)?.name
    if (name === 'TimeoutError' || name === 'AbortError') return fail('timeout')
    return fail('provider_error')
  }
  if (raw.status === 401 || raw.status === 403) return fail('unauthorized')
  if (raw.status === 400) return fail('invalid_request')
  if (raw.status < 200 || raw.status >= 300) return fail('provider_error')
  if (raw.body === null || typeof raw.body !== 'object') return fail('provider_error')
  return { ok: true, value: raw.body }
}

function fail<T>(error: AsaasError): AsaasResult<T> {
  return { ok: false, error }
}

function str(body: unknown, key: string): string | null {
  const v = (body as Record<string, unknown>)[key]
  return typeof v === 'string' && v !== '' ? v : null
}

const PAID = new Set(['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH'])
const CANCELLED = new Set(['REFUNDED', 'DELETED', 'REFUND_REQUESTED'])

/** Asaas payment status → ours. Anything not listed (risk analysis, chargebacks, …) stays `pending`. */
export function mapAsaasStatus(status: string): PixStatus {
  if (PAID.has(status)) return 'paid'
  if (status === 'OVERDUE') return 'expired'
  if (CANCELLED.has(status)) return 'cancelled'
  return 'pending'
}

const paymentPath = (id: string) => `/payments/${encodeURIComponent(id)}`

/** Creates an Asaas customer (Asaas notifications disabled). `cpfCnpj` is sent digits-only. */
export async function ensureCustomer(
  cfg: AsaasConfig | null,
  input: { name: string; cpfCnpj?: string },
  fetchImpl: FetchImpl = fetch,
): Promise<AsaasResult<{ id: string }>> {
  if (!cfg) return fail('not_configured')
  const payload: Record<string, unknown> = { name: input.name }
  if (input.cpfCnpj) payload.cpfCnpj = input.cpfCnpj.replace(/\D/g, '')
  payload.notificationDisabled = true
  const r = await call(cfg, 'POST', '/customers', payload, fetchImpl)
  if (!r.ok) return r
  const id = str(r.value, 'id')
  return id ? { ok: true, value: { id } } : fail('provider_error')
}

export async function createPixPayment(
  cfg: AsaasConfig | null,
  input: {
    customerId: string
    valueCents: number
    dueDate: string
    externalReference: string
    description: string
  },
  fetchImpl: FetchImpl = fetch,
): Promise<AsaasResult<{ id: string }>> {
  if (!cfg) return fail('not_configured')
  const r = await call(
    cfg,
    'POST',
    '/payments',
    {
      customer: input.customerId,
      billingType: 'PIX',
      value: input.valueCents / 100,
      dueDate: input.dueDate,
      externalReference: input.externalReference,
      description: input.description,
    },
    fetchImpl,
  )
  if (!r.ok) return r
  const id = str(r.value, 'id')
  return id ? { ok: true, value: { id } } : fail('provider_error')
}

export async function getPixQrCode(
  cfg: AsaasConfig | null,
  paymentId: string,
  fetchImpl: FetchImpl = fetch,
): Promise<AsaasResult<{ encodedImage: string; payload: string; expirationDate: string | null }>> {
  if (!cfg) return fail('not_configured')
  const r = await call(cfg, 'GET', `${paymentPath(paymentId)}/pixQrCode`, undefined, fetchImpl)
  if (!r.ok) return r
  const encodedImage = str(r.value, 'encodedImage')
  const payload = str(r.value, 'payload')
  if (!encodedImage || !payload) return fail('provider_error')
  return { ok: true, value: { encodedImage, payload, expirationDate: str(r.value, 'expirationDate') } }
}

/** Reais (a JSON number, e.g. 100.5) → integer cents; anything else → null. */
function cents(body: unknown, key: string): number | null {
  const v = (body as Record<string, unknown>)[key]
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v * 100) : null
}

/** A payment's status (mapped to ours) and value in cents (null when Asaas sent none). */
export async function getPayment(
  cfg: AsaasConfig | null,
  paymentId: string,
  fetchImpl: FetchImpl = fetch,
  opts: { timeoutMs?: number } = {},
): Promise<AsaasResult<{ status: PixStatus; valueCents: number | null }>> {
  if (!cfg) return fail('not_configured')
  const r = await call(cfg, 'GET', paymentPath(paymentId), undefined, fetchImpl, opts.timeoutMs)
  if (!r.ok) return r
  const status = str(r.value, 'status')
  return status
    ? { ok: true, value: { status: mapAsaasStatus(status), valueCents: cents(r.value, 'value') } }
    : fail('provider_error')
}

/** Removes a charge (used when we could not complete it on our side, so no orphan stays payable). */
export async function deletePayment(
  cfg: AsaasConfig | null,
  paymentId: string,
  fetchImpl: FetchImpl = fetch,
): Promise<AsaasResult<void>> {
  if (!cfg) return fail('not_configured')
  const r = await call(cfg, 'DELETE', paymentPath(paymentId), undefined, fetchImpl)
  return r.ok ? { ok: true, value: undefined } : r
}
