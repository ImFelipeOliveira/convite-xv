import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { uploadGiftImageAction } from '../actions'
import { getStorage } from '../storage'

const admin = vi.hoisted(() => ({ signedIn: true }))
vi.mock('@/features/admin-auth/guard', () => ({
  requireAdmin: async () => {
    // the real guard redirects (throws NEXT_REDIRECT) without a session
    if (!admin.signedIn) throw new Error('NEXT_REDIRECT')
    return { adminId: '00000000-0000-4000-8000-0000000000aa' }
  },
}))

let root: string
beforeEach(async () => {
  admin.signedIn = true
  root = await mkdtemp(path.join(tmpdir(), 'media-action-'))
  vi.stubEnv('S3_BUCKET', '')
  vi.stubEnv('MEDIA_DIR', root)
})
afterEach(async () => {
  vi.unstubAllEnvs()
  await rm(root, { recursive: true, force: true })
})

function form(file: Blob | string | null, name = 'foto.png'): FormData {
  const fd = new FormData()
  if (typeof file === 'string') fd.set('file', file)
  else if (file) fd.set('file', new File([file], name))
  return fd
}

const png = () =>
  sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#c25578' } })
    .png()
    .toBuffer()

describe('uploadGiftImageAction', () => {
  it('requires an admin and stores nothing without one', async () => {
    admin.signedIn = false
    await expect(uploadGiftImageAction(form(new Blob([new Uint8Array(await png())])))).rejects.toThrow('NEXT_REDIRECT')
    expect(await readdir(root)).toEqual([])
  })

  it('stores the processed webp under gifts/<uuid>.webp and returns its public URL', async () => {
    const res = await uploadGiftImageAction(form(new Blob([new Uint8Array(await png())])))
    if (!res.ok) throw new Error(res.error)
    expect(res.key).toMatch(/^gifts\/[0-9a-f-]{36}\.webp$/)
    expect(res.previewUrl).toBe(`/media/${res.key}`)
    const stored = await getStorage().get(res.key)
    expect(stored?.contentType).toBe('image/webp')
    const body = stored!.body
    const bytes = Buffer.isBuffer(body) ? body : Buffer.from(await new Response(body).arrayBuffer())
    expect(await sharp(bytes).metadata()).toMatchObject({ format: 'webp', width: 1200, height: 600 })
  })

  it('answers in pt-BR for a file that is not an image', async () => {
    const res = await uploadGiftImageAction(form(new Blob(['texto']), 'foto.jpg'))
    expect(res).toEqual({ ok: false, error: 'Formato não suportado. Use JPG, PNG ou WEBP.' })
  })

  it('answers in pt-BR for a file over 8 MB', async () => {
    const res = await uploadGiftImageAction(form(new Blob([new Uint8Array(8 * 1024 * 1024 + 1)])))
    expect(res).toEqual({ ok: false, error: 'A foto é grande demais (máx. 8 MB).' })
  })

  it('answers with the generic message without a file', async () => {
    expect(await uploadGiftImageAction(form(null))).toEqual({
      ok: false,
      error: 'Não foi possível enviar a foto. Tente de novo.',
    })
    expect(await uploadGiftImageAction(form('texto'))).toMatchObject({ ok: false })
  })

  it('answers with the generic message when production storage is not configured', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('MEDIA_DIR', '')
    const res = await uploadGiftImageAction(form(new Blob([new Uint8Array(await png())])))
    expect(res).toEqual({ ok: false, error: 'Não foi possível enviar a foto. Tente de novo.' })
  })
})
