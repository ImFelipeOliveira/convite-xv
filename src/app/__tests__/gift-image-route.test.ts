import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '../admin/api/gift-image/route'

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
  root = await mkdtemp(path.join(tmpdir(), 'gift-image-route-'))
  vi.stubEnv('S3_BUCKET', '')
  vi.stubEnv('MEDIA_DIR', root)
})
afterEach(async () => {
  vi.unstubAllEnvs()
  await rm(root, { recursive: true, force: true })
})

// what a browser sends for the admin's same-origin fetch
const SAME_ORIGIN = { origin: 'http://localhost', host: 'localhost' }

async function request(body: BodyInit, headers: Record<string, string> = SAME_ORIGIN) {
  return new Request('http://localhost/admin/api/gift-image', { method: 'POST', body, headers })
}

describe('POST /admin/api/gift-image', () => {
  it('calls requireAdmin itself', async () => {
    admin.signedIn = false
    const fd = new FormData()
    fd.set('file', new File(['x'], 'a.png'))
    await expect(POST(await request(fd))).rejects.toThrow('NEXT_REDIRECT')
  })

  it('uploads and answers with the key and preview URL', async () => {
    const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#fff' } }).png().toBuffer()
    const fd = new FormData()
    fd.set('file', new File([new Uint8Array(png)], 'a.png'))
    const res = await POST(await request(fd))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ ok: true, key: expect.stringMatching(/^gifts\/[0-9a-f-]{36}\.webp$/) })
    expect(json.previewUrl).toBe(`/media/${json.key}`)
  })

  it('rejects an oversized body by Content-Length before reading it', async () => {
    const res = await POST(await request('x', { ...SAME_ORIGIN, 'content-length': String(20 * 1024 * 1024) }))
    expect(res.status).toBe(413)
    expect(await res.json()).toEqual({ ok: false, error: 'A foto é grande demais (máx. 8 MB).' })
  })

  it('rejects a cross-site origin', async () => {
    const fd = new FormData()
    fd.set('file', new File(['x'], 'a.png'))
    const res = await POST(await request(fd, { origin: 'https://evil.example', host: 'localhost' }))
    expect(res.status).toBe(403)
  })

  it('rejects a request with neither an Origin nor Sec-Fetch-Site: same-origin', async () => {
    const fd = new FormData()
    fd.set('file', new File(['x'], 'a.png'))
    expect((await POST(await request(fd, {}))).status).toBe(403)
    expect((await POST(await request(fd, { 'sec-fetch-site': 'cross-site' }))).status).toBe(403)
    expect((await POST(await request(fd, { 'sec-fetch-site': 'same-site' }))).status).toBe(403)
  })

  it('accepts Sec-Fetch-Site: same-origin without an Origin header', async () => {
    const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#fff' } }).png().toBuffer()
    const fd = new FormData()
    fd.set('file', new File([new Uint8Array(png)], 'a.png'))
    const res = await POST(await request(fd, { 'sec-fetch-site': 'same-origin' }))
    expect(res.status).toBe(200)
  })

  it('a cross-site Origin loses even with Sec-Fetch-Site: same-origin', async () => {
    const fd = new FormData()
    fd.set('file', new File(['x'], 'a.png'))
    const res = await POST(await request(fd, { origin: 'https://evil.example', 'sec-fetch-site': 'same-origin' }))
    expect(res.status).toBe(403)
  })

  it('enforces the cap while streaming a body without Content-Length', async () => {
    const chunk = new Uint8Array(1024 * 1024)
    let sent = 0
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent++ < 12) controller.enqueue(chunk)
        else controller.close()
      },
    })
    const req = new Request('http://localhost/admin/api/gift-image', {
      method: 'POST',
      body,
      headers: { ...SAME_ORIGIN, 'content-type': 'multipart/form-data; boundary=x' },
      duplex: 'half',
    } as RequestInit)
    expect(req.headers.get('content-length')).toBeNull()
    const res = await POST(req)
    expect(res.status).toBe(413)
    expect(await res.json()).toEqual({ ok: false, error: 'A foto é grande demais (máx. 8 MB).' })
    // stopped reading soon after the cap instead of buffering everything
    expect(sent).toBeLessThan(12)
  })

  it('parses a streamed upload under the cap', async () => {
    const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#fff' } }).png().toBuffer()
    const fd = new FormData()
    fd.set('file', new File([new Uint8Array(png)], 'a.png'))
    const encoded = new Response(fd)
    const req = new Request('http://localhost/admin/api/gift-image', {
      method: 'POST',
      body: encoded.body,
      headers: { ...SAME_ORIGIN, 'content-type': encoded.headers.get('content-type')! },
      duplex: 'half',
    } as RequestInit)
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true })
  })
})
