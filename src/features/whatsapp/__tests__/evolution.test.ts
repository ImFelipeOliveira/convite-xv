import { afterEach, describe, expect, it, vi } from 'vitest'
import { readEvolutionConfig } from '../config'
import { connectQr, getConnectionState, logout, sendText } from '../evolution'

const cfg = { url: 'http://e:8080', apiKey: 'k', instance: 'convite-xv' }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

afterEach(() => vi.unstubAllEnvs())

describe('readEvolutionConfig', () => {
  it('returns null when EVOLUTION_URL is missing', () => {
    vi.stubEnv('EVOLUTION_URL', '')
    vi.stubEnv('EVOLUTION_API_KEY', 'k')
    expect(readEvolutionConfig()).toBeNull()
  })

  it('returns null when the api key is missing', () => {
    vi.stubEnv('EVOLUTION_URL', 'http://e:8080')
    vi.stubEnv('EVOLUTION_API_KEY', '')
    expect(readEvolutionConfig()).toBeNull()
  })

  it('strips the trailing slash and defaults the instance', () => {
    vi.stubEnv('EVOLUTION_URL', 'http://e:8080/')
    vi.stubEnv('EVOLUTION_API_KEY', 'k')
    vi.stubEnv('EVOLUTION_INSTANCE', '')
    expect(readEvolutionConfig()).toEqual(cfg)
  })
})

describe('sendText', () => {
  const input = { phoneE164: '+5595991234567', text: 'oi' }

  it('posts to the instance with apikey header and digits-only number', async () => {
    const f = vi.fn().mockResolvedValue(json({ key: { id: 'ABC' } }, 201))
    const r = await sendText(cfg, input, f)
    expect(r).toEqual({ ok: true, value: { messageId: 'ABC' } })
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('http://e:8080/message/sendText/convite-xv')
    expect(init.method).toBe('POST')
    expect(init.headers.apikey).toBe('k')
    expect(init.body).toBe('{"number":"5595991234567","text":"oi","linkPreview":true}')
  })

  it('maps timeout', async () => {
    const f = vi.fn().mockRejectedValue(new DOMException('t', 'TimeoutError'))
    expect(await sendText(cfg, input, f)).toEqual({ ok: false, error: 'timeout' })
  })

  it('maps a network error to provider_error', async () => {
    const f = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    expect(await sendText(cfg, input, f)).toEqual({ ok: false, error: 'provider_error' })
  })

  it('maps 401 to unauthorized', async () => {
    const f = vi.fn().mockResolvedValue(json({}, 401))
    expect(await sendText(cfg, input, f)).toEqual({ ok: false, error: 'unauthorized' })
  })

  it('maps 500 to provider_error', async () => {
    const f = vi.fn().mockResolvedValue(json({}, 500))
    expect(await sendText(cfg, input, f)).toEqual({ ok: false, error: 'provider_error' })
  })

  it('maps exists:false to invalid_number', async () => {
    const f = vi
      .fn()
      .mockResolvedValue(json({ response: { message: [{ exists: false }] } }, 400))
    expect(await sendText(cfg, input, f)).toEqual({ ok: false, error: 'invalid_number' })
  })

  it('maps Connection Closed to not_connected', async () => {
    const f = vi
      .fn()
      .mockResolvedValue(json({ response: { message: ['Connection Closed'] } }, 400))
    expect(await sendText(cfg, input, f)).toEqual({ ok: false, error: 'not_connected' })
  })
})

describe('getConnectionState', () => {
  it('maps the instance state', async () => {
    const f = vi.fn().mockResolvedValue(json({ instance: { state: 'open' } }))
    expect(await getConnectionState(cfg, f)).toEqual({ ok: true, value: 'open' })
    expect(f.mock.calls[0][0]).toBe('http://e:8080/instance/connectionState/convite-xv')
    expect(f.mock.calls[0][1].method).toBe('GET')
  })

  it('treats 404 as close', async () => {
    const f = vi.fn().mockResolvedValue(json({}, 404))
    expect(await getConnectionState(cfg, f)).toEqual({ ok: true, value: 'close' })
  })
})

describe('connectQr', () => {
  it('creates the instance then returns the base64 data url', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(json({}, 201))
      .mockResolvedValueOnce(json({ base64: 'data:image/png;base64,AAA' }))
    expect(await connectQr(cfg, f)).toEqual({
      ok: true,
      value: { qrDataUrl: 'data:image/png;base64,AAA' },
    })
    expect(f.mock.calls[0][0]).toBe('http://e:8080/instance/create')
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({
      instanceName: 'convite-xv',
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
    })
    expect(f.mock.calls[1][0]).toBe('http://e:8080/instance/connect/convite-xv')
  })

  it('proceeds when create says the name is already in use (403)', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(
        json({ response: { message: ['This name "convite-xv" is already in use.'] } }, 403),
      )
      .mockResolvedValueOnce(json({ base64: 'data:image/png;base64,BBB' }))
    expect(await connectQr(cfg, f)).toEqual({
      ok: true,
      value: { qrDataUrl: 'data:image/png;base64,BBB' },
    })
  })

  it('prefixes a raw base64 qr with the png data url header', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(json({}, 403))
      .mockResolvedValueOnce(json({ base64: 'iVBORw0KGgo', code: '2@abc', pairingCode: null }))
    expect(await connectQr(cfg, f)).toEqual({
      ok: true,
      value: { qrDataUrl: 'data:image/png;base64,iVBORw0KGgo' },
    })
  })

  it('reads a qr nested under qrcode (create-style answer)', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(json({}, 403))
      .mockResolvedValueOnce(json({ qrcode: { base64: 'data:image/png;base64,CCC', code: 'x' } }))
    expect(await connectQr(cfg, f)).toEqual({
      ok: true,
      value: { qrDataUrl: 'data:image/png;base64,CCC' },
    })
  })

  it.each(['javascript:alert(1)', 'http://x/y.png', 'data:text/html,<b>', 'data:image/svg+xml,<svg/>'])(
    'drops a non-png qr value (%s)',
    async (base64) => {
      const f = vi.fn().mockResolvedValueOnce(json({}, 403)).mockResolvedValueOnce(json({ base64 }))
      expect(await connectQr(cfg, f)).toEqual({ ok: true, value: { qrDataUrl: null } })
    },
  )

  it('returns null qr when only a count comes back (qr not ready yet)', async () => {
    const f = vi.fn().mockResolvedValueOnce(json({}, 403)).mockResolvedValueOnce(json({ count: 0 }))
    expect(await connectQr(cfg, f)).toEqual({ ok: true, value: { qrDataUrl: null } })
  })

  it('returns null qr when already connected', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(json({}, 403))
      .mockResolvedValueOnce(json({ instance: { state: 'open' } }))
    expect(await connectQr(cfg, f)).toEqual({ ok: true, value: { qrDataUrl: null } })
  })
})

describe('logout', () => {
  it('deletes the session', async () => {
    const f = vi.fn().mockResolvedValue(json({ status: 'SUCCESS' }))
    expect(await logout(cfg, f)).toEqual({ ok: true, value: undefined })
    expect(f.mock.calls[0][0]).toBe('http://e:8080/instance/logout/convite-xv')
    expect(f.mock.calls[0][1].method).toBe('DELETE')
  })
})
