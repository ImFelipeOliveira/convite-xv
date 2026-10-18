import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getStorage } from '@/features/media/storage'
import { resetRateLimits } from '@/lib/rate-limit'
import { GET } from '../media/[...key]/route'

const KEY = 'gifts/0b0e6b3c-3f43-4a52-9a43-2f6a6b4c1d2e.webp'

const call = (key: string[], ip = '198.51.100.7') =>
  GET(new Request(`http://localhost/media/${key.join('/')}`, { headers: { 'x-real-ip': ip } }), {
    params: Promise.resolve({ key }),
  })

let root: string
beforeEach(async () => {
  resetRateLimits()
  root = await mkdtemp(path.join(tmpdir(), 'media-route-'))
  vi.stubEnv('S3_BUCKET', '')
  vi.stubEnv('MEDIA_DIR', root)
})
afterEach(async () => {
  vi.unstubAllEnvs()
  await rm(root, { recursive: true, force: true })
})

describe('GET /media/[...key]', () => {
  it.each([
    [['gifts', 'nope.webp']],
    [['gifts', '0b0e6b3c-3f43-4a52-9a43-2f6a6b4c1d2e.png']],
    [['other', '0b0e6b3c-3f43-4a52-9a43-2f6a6b4c1d2e.webp']],
    [['gifts', '..', '..', 'etc', 'passwd']],
    [['gifts', '0B0E6B3C-3F43-4A52-9A43-2F6A6B4C1D2E.webp']],
  ])('404s a key outside the allowed pattern: %j', async (key) => {
    const res = await call(key)
    expect(res.status).toBe(404)
  })

  it('404s a well-formed key that is not stored', async () => {
    expect((await call(KEY.split('/'))).status).toBe(404)
  })

  it('serves a stored image with immutable cache headers', async () => {
    await getStorage().put(KEY, Buffer.from('webp-bytes'), 'image/webp')
    const res = await call(KEY.split('/'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/webp')
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('content-security-policy')).toBe("default-src 'none'; sandbox; frame-ancestors 'none'")
    expect(res.headers.get('content-length')).toBe('10')
    expect(await res.text()).toBe('webp-bytes')
  })

  it('503s when production storage is not configured', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('MEDIA_DIR', '')
    expect((await call(KEY.split('/'))).status).toBe(503)
  })

  it('rate-limits each client IP to 300 requests a minute, before touching storage', async () => {
    for (let i = 0; i < 300; i++) expect((await call(KEY.split('/'), '198.51.100.9')).status).toBe(404)
    expect((await call(KEY.split('/'), '198.51.100.9')).status).toBe(429)
    // other clients are unaffected
    expect((await call(KEY.split('/'), '198.51.100.10')).status).toBe(404)
  })
})
