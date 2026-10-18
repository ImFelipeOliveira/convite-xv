import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getStorage } from '@/features/media/storage'
import { resetRateLimits } from '@/lib/rate-limit'
import { GET } from '../media/[...key]/route'

const KEY = 'gifts/0b0e6b3c-3f43-4a52-9a43-2f6a6b4c1d2e.webp'

const MUSIC = 'music/7d1f0c55-9a2b-4c3d-8e4f-0a1b2c3d4e5f.mp3'
const MUSIC_M4A = 'music/7d1f0c55-9a2b-4c3d-8e4f-0a1b2c3d4e5f.m4a'
// 0x00..0xff repeated: every byte position is recognizable in a slice
const SONG = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 256))

const call = (key: string[], ip = '198.51.100.7', headers: Record<string, string> = {}) =>
  GET(new Request(`http://localhost/media/${key.join('/')}`, { headers: { 'x-real-ip': ip, ...headers } }), {
    params: Promise.resolve({ key }),
  })
const ranged = (key: string, range: string) => call(key.split('/'), '198.51.100.7', { range })

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
    [['music', '7d1f0c55-9a2b-4c3d-8e4f-0a1b2c3d4e5f.wav']],
    [['music', '7d1f0c55-9a2b-4c3d-8e4f-0a1b2c3d4e5f.webp']],
    [['music', '..', 'gifts', '0b0e6b3c-3f43-4a52-9a43-2f6a6b4c1d2e.webp']],
    [['music', '..', '..', '.env.local']],
    [['music', 'cinnamon-girl.mp3']],
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

  it('serves the music as audio/mpeg (mp3) or audio/mp4 (m4a), immutable, advertising byte ranges', async () => {
    await getStorage().put(MUSIC, SONG, 'audio/mpeg')
    await getStorage().put(MUSIC_M4A, SONG, 'audio/mp4')
    const res = await call(MUSIC.split('/'))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('audio/mpeg')
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    expect(res.headers.get('accept-ranges')).toBe('bytes')
    expect(res.headers.get('content-length')).toBe('1000')
    expect(Buffer.from(await res.arrayBuffer()).equals(SONG)).toBe(true)
    expect((await call(MUSIC_M4A.split('/'))).headers.get('content-type')).toBe('audio/mp4')
  })

  describe('Range requests (iOS Safari needs them for audio)', () => {
    beforeEach(async () => {
      await getStorage().put(MUSIC, SONG, 'audio/mpeg')
    })

    it("answers Safari's first probe (bytes=0-1) with 206 and the two bytes", async () => {
      const res = await ranged(MUSIC, 'bytes=0-1')
      expect(res.status).toBe(206)
      expect(res.headers.get('content-range')).toBe('bytes 0-1/1000')
      expect(res.headers.get('content-length')).toBe('2')
      expect(res.headers.get('content-type')).toBe('audio/mpeg')
      expect(res.headers.get('accept-ranges')).toBe('bytes')
      expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
      expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([0, 1])
    })

    it('serves a middle slice, an open-ended range and a suffix range', async () => {
      const middle = await ranged(MUSIC, 'bytes=300-303')
      expect(middle.status).toBe(206)
      expect(middle.headers.get('content-range')).toBe('bytes 300-303/1000')
      expect(Buffer.from(await middle.arrayBuffer()).equals(SONG.subarray(300, 304))).toBe(true)

      const tail = await ranged(MUSIC, 'bytes=990-')
      expect(tail.headers.get('content-range')).toBe('bytes 990-999/1000')
      expect(tail.headers.get('content-length')).toBe('10')
      expect(Buffer.from(await tail.arrayBuffer()).equals(SONG.subarray(990))).toBe(true)

      const suffix = await ranged(MUSIC, 'bytes=-4')
      expect(suffix.headers.get('content-range')).toBe('bytes 996-999/1000')
      expect(Buffer.from(await suffix.arrayBuffer()).equals(SONG.subarray(996))).toBe(true)
    })

    it('clamps an end past the size', async () => {
      const res = await ranged(MUSIC, 'bytes=998-5000')
      expect(res.status).toBe(206)
      expect(res.headers.get('content-range')).toBe('bytes 998-999/1000')
      expect(res.headers.get('content-length')).toBe('2')
    })

    it('416s a range that starts past the end, with the size in Content-Range', async () => {
      const res = await ranged(MUSIC, 'bytes=1000-')
      expect(res.status).toBe(416)
      expect(res.headers.get('content-range')).toBe('bytes */1000')
      expect(await res.text()).toBe('')
    })

    it('ignores malformed and multi-part ranges: 200 with the whole file', async () => {
      for (const range of ['bytes=5-1', 'bytes=0-1,4-5', 'items=0-1', 'bytes=x-']) {
        const res = await ranged(MUSIC, range)
        expect(res.status, range).toBe(200)
        expect(res.headers.get('content-length'), range).toBe('1000')
        expect(res.headers.get('content-range'), range).toBeNull()
      }
    })

    it('a range never makes an invalid key readable', async () => {
      expect((await call(['music', '..', '..', 'package.json'], '198.51.100.7', { range: 'bytes=0-10' })).status).toBe(404)
    })

    it('ranges work on gift photos too', async () => {
      await getStorage().put(KEY, Buffer.from('webp-bytes'), 'image/webp')
      const res = await ranged(KEY, 'bytes=0-3')
      expect(res.status).toBe(206)
      expect(await res.text()).toBe('webp')
    })
  })
})
