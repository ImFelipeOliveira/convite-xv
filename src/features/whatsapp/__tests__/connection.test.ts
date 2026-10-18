import { describe, expect, it, vi } from 'vitest'
import { disconnect, pollStatus, readStatus, startConnect, type ConnectionDeps } from '../connection'

const cfg = { url: 'http://e:8080', apiKey: 'k', instance: 'convite-xv' }
const QR = 'data:image/png;base64,AAA'

function deps(over: Partial<ConnectionDeps> = {}): ConnectionDeps {
  return {
    readEvolutionConfig: () => cfg,
    getConnectionState: vi.fn().mockResolvedValue({ ok: true, value: 'close' }),
    connectQr: vi.fn().mockResolvedValue({ ok: true, value: { qrDataUrl: QR } }),
    fetchQr: vi.fn().mockResolvedValue({ ok: true, value: { qrDataUrl: QR } }),
    logout: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
    sleep: vi.fn().mockResolvedValue(undefined),
    ...over,
  }
}

describe('readStatus', () => {
  it('is not_configured without env', async () => {
    expect(await readStatus(deps({ readEvolutionConfig: () => null }))).toBe('not_configured')
  })
  it('maps provider failures to unavailable', async () => {
    const d = deps({ getConnectionState: vi.fn().mockResolvedValue({ ok: false, error: 'timeout' }) })
    expect(await readStatus(d)).toBe('unavailable')
  })
  it('returns the provider state', async () => {
    const d = deps({ getConnectionState: vi.fn().mockResolvedValue({ ok: true, value: 'open' }) })
    expect(await readStatus(d)).toBe('open')
  })
})

describe('startConnect', () => {
  it('returns the QR', async () => {
    expect(await startConnect(deps())).toEqual({ ok: true, state: 'connecting', qrDataUrl: QR })
  })
  it('reports connected when there is no QR because the number is already open', async () => {
    const d = deps({
      connectQr: vi.fn().mockResolvedValue({ ok: true, value: { qrDataUrl: null } }),
      getConnectionState: vi.fn().mockResolvedValue({ ok: true, value: 'open' }),
    })
    expect(await startConnect(d)).toEqual({ ok: true, state: 'open' })
  })
  it('asks again while the QR is not ready, then gives up with qr_unavailable', async () => {
    const fetchQr = vi.fn().mockResolvedValue({ ok: true, value: { qrDataUrl: null } })
    const d = deps({
      connectQr: vi.fn().mockResolvedValue({ ok: true, value: { qrDataUrl: null } }),
      getConnectionState: vi.fn().mockResolvedValue({ ok: true, value: 'connecting' }),
      fetchQr,
    })
    expect(await startConnect(d)).toEqual({ ok: false, error: 'qr_unavailable' })
    expect(fetchQr).toHaveBeenCalledTimes(3)
  })
  it('uses a QR that shows up on a later try', async () => {
    const d = deps({
      connectQr: vi.fn().mockResolvedValue({ ok: true, value: { qrDataUrl: null } }),
      getConnectionState: vi.fn().mockResolvedValue({ ok: true, value: 'connecting' }),
      fetchQr: vi
        .fn()
        .mockResolvedValueOnce({ ok: true, value: { qrDataUrl: null } })
        .mockResolvedValueOnce({ ok: true, value: { qrDataUrl: QR } }),
    })
    expect(await startConnect(d)).toEqual({ ok: true, state: 'connecting', qrDataUrl: QR })
  })
  it('maps errors', async () => {
    expect(await startConnect(deps({ readEvolutionConfig: () => null }))).toEqual({
      ok: false,
      error: 'not_configured',
    })
    const unauthorized = deps({ connectQr: vi.fn().mockResolvedValue({ ok: false, error: 'unauthorized' }) })
    expect(await startConnect(unauthorized)).toEqual({ ok: false, error: 'unauthorized' })
    const down = deps({ connectQr: vi.fn().mockResolvedValue({ ok: false, error: 'provider_error' }) })
    expect(await startConnect(down)).toEqual({ ok: false, error: 'unavailable' })
  })
})

describe('pollStatus', () => {
  it('only fetches a fresh QR when asked and still connecting', async () => {
    const fetchQr = vi.fn().mockResolvedValue({ ok: true, value: { qrDataUrl: 'data:image/png;base64,NEW' } })
    const connecting = vi.fn().mockResolvedValue({ ok: true, value: 'connecting' })
    expect(await pollStatus(false, deps({ getConnectionState: connecting, fetchQr }))).toEqual({
      state: 'connecting',
    })
    expect(fetchQr).not.toHaveBeenCalled()
    expect(await pollStatus(true, deps({ getConnectionState: connecting, fetchQr }))).toEqual({
      state: 'connecting',
      qrDataUrl: 'data:image/png;base64,NEW',
    })
    const open = vi.fn().mockResolvedValue({ ok: true, value: 'open' })
    expect(await pollStatus(true, deps({ getConnectionState: open, fetchQr }))).toEqual({ state: 'open' })
    expect(fetchQr).toHaveBeenCalledTimes(1)
  })
})

describe('disconnect', () => {
  it('logs out', async () => {
    expect(await disconnect(deps())).toEqual({ ok: true })
  })
  it('counts a failed logout as done when the number is already closed', async () => {
    const d = deps({ logout: vi.fn().mockResolvedValue({ ok: false, error: 'provider_error' }) })
    expect(await disconnect(d)).toEqual({ ok: true })
  })
  it('fails when the number is still connected', async () => {
    const d = deps({
      logout: vi.fn().mockResolvedValue({ ok: false, error: 'provider_error' }),
      getConnectionState: vi.fn().mockResolvedValue({ ok: true, value: 'open' }),
    })
    expect(await disconnect(d)).toEqual({ ok: false, error: 'unavailable' })
  })
})
