import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getStorage } from '@/features/media/storage'
import { deleteGiftAction, saveGiftAction } from '../admin-actions'
import { createGift, listGiftsAdmin } from '../repo'

vi.mock('@/features/admin-auth/guard', () => ({
  requireAdmin: async () => ({ adminId: '00000000-0000-4000-8000-0000000000aa' }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

const KEY_A = 'gifts/0b0e6b3c-3f43-4a52-9a43-2f6a6b4c1d2e.webp'
const KEY_B = 'gifts/1c1f7c4d-4054-4b63-8b54-3a7b7c5d2e3f.webp'

let root: string
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'gift-actions-'))
  vi.stubEnv('S3_BUCKET', '')
  vi.stubEnv('MEDIA_DIR', root)
  for (const key of [KEY_A, KEY_B]) await getStorage().put(key, Buffer.from(key), 'image/webp')
})
afterEach(async () => {
  vi.unstubAllEnvs()
  await rm(root, { recursive: true, force: true })
})

function form(values: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(values)) fd.set(k, v)
  return fd
}

const base = { category: 'Beleza', priceCents: null, imageUrl: null, purchaseUrl: null }

describe('saveGiftAction photo', () => {
  it('persists the uploaded image key', async () => {
    const res = await saveGiftAction(null, form({ name: 'Perfume', imageKey: KEY_A }))
    expect(res).toEqual({ ok: true, message: 'Presente salvo.' })
    expect((await listGiftsAdmin())[0].imageKey).toBe(KEY_A)
  })

  it('ignores an image key that is not one of ours', async () => {
    const res = await saveGiftAction(null, form({ name: 'Perfume', imageKey: '../../etc/passwd' }))
    expect(res).toMatchObject({ ok: false, error: 'Não foi possível enviar a foto. Tente de novo.' })
    expect(await listGiftsAdmin()).toEqual([])
  })

  it('deletes the old object when the photo is replaced', async () => {
    const g = await createGift({ ...base, name: 'Perfume', imageKey: KEY_A })
    await saveGiftAction(null, form({ id: g.id, name: 'Perfume', imageKey: KEY_B }))
    expect((await listGiftsAdmin())[0].imageKey).toBe(KEY_B)
    expect(await getStorage().get(KEY_A)).toBeNull()
    expect(await getStorage().get(KEY_B)).not.toBeNull()
  })

  it('deletes the old object when the photo is removed, keeping the link field', async () => {
    const g = await createGift({ ...base, name: 'Perfume', imageKey: KEY_A })
    await saveGiftAction(null, form({ id: g.id, name: 'Perfume', imageKey: '', imageUrl: 'https://loja.com/a.jpg' }))
    const [row] = await listGiftsAdmin()
    expect(row).toMatchObject({ imageKey: null, imageUrl: 'https://loja.com/a.jpg' })
    expect(await getStorage().get(KEY_A)).toBeNull()
  })

  it('keeps the object when the photo did not change', async () => {
    const g = await createGift({ ...base, name: 'Perfume', imageKey: KEY_A })
    await saveGiftAction(null, form({ id: g.id, name: 'Perfume floral', imageKey: KEY_A }))
    expect(await getStorage().get(KEY_A)).not.toBeNull()
  })
})

describe('deleteGiftAction photo', () => {
  it('deletes the stored photo with the gift', async () => {
    const g = await createGift({ ...base, name: 'Perfume', imageKey: KEY_A })
    expect(await deleteGiftAction(g.id)).toEqual({ ok: true, changed: true })
    expect(await getStorage().get(KEY_A)).toBeNull()
  })
})
