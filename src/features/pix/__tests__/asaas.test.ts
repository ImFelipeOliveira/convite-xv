import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createPixPayment,
  deletePayment,
  ensureCustomer,
  getPayment,
  getPixQrCode,
  mapAsaasStatus,
} from '../asaas'
import { readAsaasConfig, requirePayerCpf } from '../config'

const cfg = { apiKey: 'k', baseUrl: 'http://asaas.test/v3', webhookToken: null }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

afterEach(() => vi.unstubAllEnvs())

describe('readAsaasConfig', () => {
  it('returns null without an api key', () => {
    vi.stubEnv('ASAAS_API_KEY', '')
    expect(readAsaasConfig()).toBeNull()
  })

  it('uses the sandbox url by default and for ASAAS_ENV=sandbox', () => {
    vi.stubEnv('ASAAS_API_KEY', 'k')
    vi.stubEnv('ASAAS_BASE_URL', '')
    vi.stubEnv('ASAAS_ENV', '')
    vi.stubEnv('ASAAS_WEBHOOK_TOKEN', '')
    expect(readAsaasConfig()).toEqual({
      apiKey: 'k',
      baseUrl: 'https://api-sandbox.asaas.com/v3',
      webhookToken: null,
    })
    vi.stubEnv('ASAAS_ENV', 'sandbox')
    expect(readAsaasConfig()?.baseUrl).toBe('https://api-sandbox.asaas.com/v3')
  })

  it('uses the production url for ASAAS_ENV=production', () => {
    vi.stubEnv('ASAAS_API_KEY', 'k')
    vi.stubEnv('ASAAS_BASE_URL', '')
    vi.stubEnv('ASAAS_ENV', 'production')
    vi.stubEnv('ASAAS_WEBHOOK_TOKEN', 'whk')
    expect(readAsaasConfig()).toEqual({
      apiKey: 'k',
      baseUrl: 'https://api.asaas.com/v3',
      webhookToken: 'whk',
    })
  })

  it('lets ASAAS_BASE_URL override the env url (trailing slash stripped)', () => {
    vi.stubEnv('ASAAS_API_KEY', 'k')
    vi.stubEnv('ASAAS_ENV', 'production')
    vi.stubEnv('ASAAS_BASE_URL', 'http://127.0.0.1:4220/v3/')
    expect(readAsaasConfig()?.baseUrl).toBe('http://127.0.0.1:4220/v3')
  })

  it('unescapes a dotenv-escaped key (\\$aact_...)', () => {
    vi.stubEnv('ASAAS_API_KEY', '\\$aact_hmlg_abc')
    expect(readAsaasConfig()?.apiKey).toBe('$aact_hmlg_abc')
  })

  it('requires the payer CPF unless ASAAS_REQUIRE_PAYER_CPF=false', () => {
    vi.stubEnv('ASAAS_REQUIRE_PAYER_CPF', '')
    expect(requirePayerCpf()).toBe(true)
    vi.stubEnv('ASAAS_REQUIRE_PAYER_CPF', 'true')
    expect(requirePayerCpf()).toBe(true)
    vi.stubEnv('ASAAS_REQUIRE_PAYER_CPF', 'false')
    expect(requirePayerCpf()).toBe(false)
  })
})

describe('mapAsaasStatus', () => {
  it.each([
    ['RECEIVED', 'paid'],
    ['CONFIRMED', 'paid'],
    ['RECEIVED_IN_CASH', 'paid'],
    ['OVERDUE', 'expired'],
    ['REFUNDED', 'cancelled'],
    ['DELETED', 'cancelled'],
    ['REFUND_REQUESTED', 'cancelled'],
    ['PENDING', 'pending'],
    ['AWAITING_RISK_ANALYSIS', 'pending'],
  ])('maps %s to %s', (raw, mapped) => {
    expect(mapAsaasStatus(raw)).toBe(mapped)
  })
})

describe('request shape', () => {
  it('sends access_token, a User-Agent and json to the configured base url', async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(json({ id: 'cus_1' }))
    expect(await ensureCustomer(cfg, { name: 'Convidados' }, f)).toEqual({
      ok: true,
      value: { id: 'cus_1' },
    })
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('http://asaas.test/v3/customers')
    expect(init?.method).toBe('POST')
    const headers = init?.headers as Record<string, string>
    expect(headers.access_token).toBe('k')
    expect(headers['user-agent']).toBe('convite-xv')
    expect(headers['content-type']).toBe('application/json')
    expect(JSON.parse(String(init?.body))).toEqual({
      name: 'Convidados',
      notificationDisabled: true,
    })
  })

  it('sends cpfCnpj (digits only) when given', async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(json({ id: 'cus_2' }))
    await ensureCustomer(cfg, { name: 'Ana', cpfCnpj: '529.982.247-25' }, f)
    expect(JSON.parse(String(f.mock.calls[0][1]?.body)).cpfCnpj).toBe('52998224725')
  })

  it('creates a PIX payment with value in reais', async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(json({ id: 'pay_1', status: 'PENDING' }))
    const r = await createPixPayment(
      cfg,
      {
        customerId: 'cus_1',
        valueCents: 12550,
        dueDate: '2026-10-18',
        externalReference: 'ref-1',
        description: 'Presente',
      },
      f,
    )
    expect(r).toEqual({ ok: true, value: { id: 'pay_1' } })
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('http://asaas.test/v3/payments')
    expect(JSON.parse(String(init?.body))).toEqual({
      customer: 'cus_1',
      billingType: 'PIX',
      value: 125.5,
      dueDate: '2026-10-18',
      externalReference: 'ref-1',
      description: 'Presente',
    })
  })

  it('fetches the QR code', async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(
      json({
        encodedImage: 'iVBORw0KGgo=',
        payload: '00020126...',
        expirationDate: '2026-10-19 23:59:59',
        success: true,
      }),
    )
    expect(await getPixQrCode(cfg, 'pay_1', f)).toEqual({
      ok: true,
      value: {
        encodedImage: 'iVBORw0KGgo=',
        payload: '00020126...',
        expirationDate: '2026-10-19 23:59:59',
      },
    })
    expect(f.mock.calls[0][0]).toBe('http://asaas.test/v3/payments/pay_1/pixQrCode')
    expect(f.mock.calls[0][1]?.method).toBe('GET')
  })

  it('reads a payment status and value (in cents)', async () => {
    const f = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ id: 'pay_1', status: 'REFUND_REQUESTED', value: 100.5, externalReference: 'ref-1' }))
    expect(await getPayment(cfg, 'pay_1', f)).toEqual({
      ok: true,
      value: { status: 'cancelled', asaasStatus: 'REFUND_REQUESTED', valueCents: 10050, externalReference: 'ref-1' },
    })
    expect(f.mock.calls[0][0]).toBe('http://asaas.test/v3/payments/pay_1')
  })

  it('a missing or invalid value reads as null', async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(json({ id: 'pay_1', status: 'RECEIVED', value: '100' }))
    expect(await getPayment(cfg, 'pay_1', f)).toEqual({
      ok: true,
      value: { status: 'paid', asaasStatus: 'RECEIVED', valueCents: null, externalReference: null },
    })
  })

  it('honours a shorter timeout', async () => {
    const f = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
        }),
    )
    expect(await getPayment(cfg, 'pay_1', f, { timeoutMs: 20 })).toEqual({ ok: false, error: 'timeout' })
  })

  it('deletes a payment', async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(json({ deleted: true, id: 'pay_1' }))
    expect(await deletePayment(cfg, 'pay_1', f)).toEqual({ ok: true, value: undefined })
    expect(f.mock.calls[0][1]?.method).toBe('DELETE')
  })

  it('encodes ids in the path', async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(json({ status: 'PENDING' }))
    await getPayment(cfg, '../x', f)
    expect(f.mock.calls[0][0]).toBe('http://asaas.test/v3/payments/..%2Fx')
  })
})

describe('errors (never throws)', () => {
  const call = (f: typeof fetch) => getPayment(cfg, 'pay_1', f)

  it('answers not_configured without a config and never calls fetch', async () => {
    const f = vi.fn<typeof fetch>()
    expect(await getPayment(null, 'pay_1', f)).toEqual({ ok: false, error: 'not_configured' })
    expect(await ensureCustomer(null, { name: 'x' }, f)).toEqual({
      ok: false,
      error: 'not_configured',
    })
    expect(f).not.toHaveBeenCalled()
  })

  it('maps a timeout', async () => {
    const f = vi.fn<typeof fetch>().mockRejectedValue(new DOMException('t', 'TimeoutError'))
    expect(await call(f)).toEqual({ ok: false, error: 'timeout' })
  })

  it('passes a timeout signal', async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(json({ status: 'PENDING' }))
    await call(f)
    expect(f.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal)
  })

  it('maps a network error to provider_error', async () => {
    const f = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('fetch failed'))
    expect(await call(f)).toEqual({ ok: false, error: 'provider_error' })
  })

  it.each([401, 403])('maps %s to unauthorized', async (status) => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(json({}, status))
    expect(await call(f)).toEqual({ ok: false, error: 'unauthorized' })
  })

  it('maps 400 to invalid_request', async () => {
    const f = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ errors: [{ code: 'invalid_cpfCnpj', description: 'x' }] }, 400))
    expect(await call(f)).toEqual({ ok: false, error: 'invalid_request' })
  })

  it.each([404, 500, 502])('maps %s to provider_error', async (status) => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(json({}, status))
    expect(await call(f)).toEqual({ ok: false, error: 'provider_error' })
  })

  it('maps a non-json 200 to provider_error', async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(new Response('<html>', { status: 200 }))
    expect(await call(f)).toEqual({ ok: false, error: 'provider_error' })
  })

  it('maps a 200 without an id to provider_error', async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(json({}))
    expect(await ensureCustomer(cfg, { name: 'x' }, f)).toEqual({
      ok: false,
      error: 'provider_error',
    })
  })

  it('maps a QR answer missing the payload to provider_error', async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(json({ encodedImage: 'x' }))
    expect(await getPixQrCode(cfg, 'pay_1', f)).toEqual({ ok: false, error: 'provider_error' })
  })

  it('never throws even when fetch throws synchronously', async () => {
    const f = (() => {
      throw new Error('boom')
    }) as unknown as typeof fetch
    expect(await call(f)).toEqual({ ok: false, error: 'provider_error' })
  })
})
