import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFsStorage, getStorage } from '../storage'

let root: string
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'media-'))
})
afterEach(async () => {
  vi.unstubAllEnvs()
  await rm(root, { recursive: true, force: true })
})

async function bytesOf(body: ReadableStream | Buffer): Promise<Buffer> {
  return Buffer.isBuffer(body) ? body : Buffer.from(await new Response(body).arrayBuffer())
}

describe('filesystem storage', () => {
  it('puts, gets and deletes an object', async () => {
    const storage = createFsStorage(root)
    const key = 'gifts/0b0e6b3c-3f43-4a52-9a43-2f6a6b4c1d2e.webp'
    await storage.put(key, Buffer.from('webp-bytes'), 'image/webp')

    const got = await storage.get(key)
    expect(got).not.toBeNull()
    expect(got!.contentType).toBe('image/webp')
    expect(got!.contentLength).toBe(10)
    expect((await bytesOf(got!.body)).toString()).toBe('webp-bytes')

    await storage.delete(key)
    expect(await storage.get(key)).toBeNull()
  })

  it('returns null for a missing object and deleting it is a no-op', async () => {
    const storage = createFsStorage(root)
    expect(await storage.get('gifts/missing.webp')).toBeNull()
    await expect(storage.delete('gifts/missing.webp')).resolves.toBeUndefined()
  })

  it('refuses keys that escape the media folder', async () => {
    const storage = createFsStorage(root)
    await expect(storage.put('../evil.webp', Buffer.from('x'), 'image/webp')).rejects.toThrow()
    expect(await storage.get('../../etc/passwd')).toBeNull()
    expect(await readdir(root)).toEqual([])
  })
})

describe('getStorage', () => {
  it('uses the filesystem without S3 config (never throws on missing config)', async () => {
    vi.stubEnv('S3_BUCKET', '')
    vi.stubEnv('MEDIA_DIR', root)
    const storage = getStorage()
    await storage.put('gifts/a.webp', Buffer.from('x'), 'image/webp')
    expect(await readdir(path.join(root, 'gifts'))).toContain('a.webp')
  })
})
