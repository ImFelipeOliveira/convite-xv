import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mp4WithBrand, silentMp3 } from '@/features/media/__tests__/audio-fixtures'
import { POST } from '../admin/api/music/route'

const admin = vi.hoisted(() => ({ signedIn: true }))
vi.mock('@/features/admin-auth/guard', () => ({
  requireAdmin: async () => {
    if (!admin.signedIn) throw new Error('NEXT_REDIRECT')
    return { adminId: '00000000-0000-4000-8000-0000000000aa' }
  },
}))

let root: string
beforeEach(async () => {
  admin.signedIn = true
  root = await mkdtemp(path.join(tmpdir(), 'music-route-'))
  vi.stubEnv('S3_BUCKET', '')
  vi.stubEnv('MEDIA_DIR', root)
})
afterEach(async () => {
  vi.unstubAllEnvs()
  await rm(root, { recursive: true, force: true })
})

const SAME_ORIGIN = { origin: 'http://localhost', host: 'localhost' }

function request(body: BodyInit, headers: Record<string, string> = SAME_ORIGIN) {
  return new Request('http://localhost/admin/api/music', { method: 'POST', body, headers })
}

function form(bytes: Uint8Array, name: string, type: string): FormData {
  const fd = new FormData()
  fd.set('file', new File([new Uint8Array(bytes)], name, { type }))
  return fd
}

async function stored(): Promise<string[]> {
  try {
    return await readdir(path.join(root, 'music'))
  } catch {
    return []
  }
}

describe('POST /admin/api/music', () => {
  it('calls requireAdmin first and stores nothing without a session', async () => {
    admin.signedIn = false
    await expect(POST(request(form(silentMp3(), 'a.mp3', 'audio/mpeg')))).rejects.toThrow('NEXT_REDIRECT')
    expect(await stored()).toEqual([])
  })

  it('stores an mp3 byte for byte under music/<uuid>.mp3 and answers its /media URL', async () => {
    const mp3 = silentMp3()
    const res = await POST(request(form(mp3, 'Cinnamon Girl.mp3', 'audio/mpeg')))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ ok: true, key: expect.stringMatching(/^music\/[0-9a-f-]{36}\.mp3$/) })
    expect(json.url).toBe(`/media/${json.key}`)
    expect((await readFile(path.join(root, json.key))).equals(mp3)).toBe(true)
  })

  it('stores an m4a as .m4a, whatever the browser called it', async () => {
    const res = await POST(request(form(mp4WithBrand('M4A '), 'musica.m4a', 'audio/x-m4a')))
    const json = await res.json()
    expect(json.key).toMatch(/^music\/[0-9a-f-]{36}\.m4a$/)
  })

  it('rejects a file that only claims to be audio (magic bytes), in pt-BR', async () => {
    const res = await POST(request(form(new TextEncoder().encode('<html>oi</html>'), 'a.mp3', 'audio/mpeg')))
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ ok: false, error: 'Formato não suportado. Use MP3 ou M4A.' })
    expect(await stored()).toEqual([])
  })

  it('rejects real audio bytes declared as a non-audio type', async () => {
    const res = await POST(request(form(silentMp3(), 'a.html', 'text/html')))
    expect(res.status).toBe(422)
    expect(await stored()).toEqual([])
  })

  it('rejects an oversized body by Content-Length before reading it', async () => {
    const res = await POST(request('x', { ...SAME_ORIGIN, 'content-length': String(20 * 1024 * 1024) }))
    expect(res.status).toBe(413)
    expect(await res.json()).toEqual({ ok: false, error: 'A música é grande demais (máx. 8 MB).' })
  })

  it('rejects a file over 8 MB even when Content-Length is missing', async () => {
    const big = new Uint8Array(8 * 1024 * 1024 + 1)
    big.set(silentMp3())
    const res = await POST(request(form(big, 'a.mp3', 'audio/mpeg')))
    expect([413, 422]).toContain(res.status)
    expect((await res.json()).error).toBe('A música é grande demais (máx. 8 MB).')
    expect(await stored()).toEqual([])
  })

  it('rejects a cross-site origin and a request without origin proof', async () => {
    const fd = () => form(silentMp3(), 'a.mp3', 'audio/mpeg')
    expect((await POST(request(fd(), { origin: 'https://evil.example', host: 'localhost' }))).status).toBe(403)
    expect((await POST(request(fd(), { host: 'localhost' }))).status).toBe(403)
    expect((await POST(request(fd(), { host: 'localhost', 'sec-fetch-site': 'same-origin' }))).status).toBe(200)
  })
})
