'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdmin } from '@/features/admin-auth/guard'
import { logger } from '@/lib/logger'
import { isGiftImageKey } from '@/features/media/keys'
import { getStorage } from '@/features/media/storage'
import {
  adminReleaseGift,
  createGift,
  deleteGift,
  isImageKeyReferenced,
  updateGiftReturningPreviousImageKey,
} from './repo'
import { giftFormSchema } from './schema'

const GIFTS_PATH = '/admin/gifts'
const SUMMARY_PATH = '/admin'
const NOT_FOUND = 'Presente não encontrado.'

export type GiftField = 'name' | 'category' | 'price' | 'purchaseUrl' | 'imageUrl' | 'imageKey' | 'sortOrder'
const FIELDS: GiftField[] = ['name', 'category', 'price', 'purchaseUrl', 'imageUrl', 'imageKey', 'sortOrder']
const IMAGE_ERROR = 'Não foi possível enviar a foto. Tente de novo.'

export type GiftFormState =
  | { ok: true; message: string }
  | {
      ok: false
      error?: string
      fieldErrors?: Partial<Record<GiftField, string>>
      values?: Record<GiftField, string>
    }
  | null

function text(formData: FormData, name: string): string {
  const v = formData.get(name)
  return typeof v === 'string' ? v : ''
}

const idSchema = z.uuid()

/**
 * Best effort: a leftover object only costs storage, so a failure is logged (key only) and ignored. Only our
 * own key shape is ever deleted, and never while another gift still points at it.
 */
async function deleteImage(key: string, adminId: string) {
  if (!isGiftImageKey(key)) return
  try {
    if (await isImageKeyReferenced(key)) return
    await getStorage().delete(key)
    logger.info({ event: 'admin.gift_image_deleted', adminId, key }, 'gift image deleted')
  } catch (err) {
    logger.warn({ event: 'admin.gift_image_delete_failed', adminId, key, err }, 'gift image delete failed')
  }
}

function revalidate() {
  revalidatePath(GIFTS_PATH)
  revalidatePath(SUMMARY_PATH)
}

/** Creates a gift, or updates one when the form carries an `id`. */
export async function saveGiftAction(_prev: GiftFormState, formData: FormData): Promise<GiftFormState> {
  const { adminId } = await requireAdmin()
  const id = text(formData, 'id')
  const values = Object.fromEntries(FIELDS.map((f) => [f, text(formData, f)])) as Record<GiftField, string>
  if (id && !idSchema.safeParse(id).success) return { ok: false, error: NOT_FOUND, values }
  const parsed = giftFormSchema.safeParse(values)
  if (!parsed.success) {
    const fieldErrors: Partial<Record<GiftField, string>> = {}
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as GiftField
      fieldErrors[key] ??= issue.message
    }
    return { ok: false, fieldErrors, values }
  }

  // an uploaded photo (POST /admin/api/gift-image) arrives as its key; only our own key shape is accepted
  const imageKey = values.imageKey.trim() || null
  if (imageKey && !isGiftImageKey(imageKey)) return { ok: false, error: IMAGE_ERROR, values }

  const data = { ...parsed.data, imageKey }
  let gift
  let previousKey: string | null = null
  if (id) {
    const updated = await updateGiftReturningPreviousImageKey(id, data)
    if (!updated) return { ok: false, error: NOT_FOUND, values }
    ;({ gift, previousImageKey: previousKey } = updated)
  } else {
    gift = await createGift(data)
  }
  logger.info({ event: 'admin.gift_saved', giftId: gift.id, adminId }, 'gift saved')
  if (previousKey && previousKey !== imageKey) await deleteImage(previousKey, adminId)
  revalidate()
  return { ok: true, message: 'Presente salvo.' }
}

/** `changed: false` = nothing to do (already gone / already free), so the UI can say so. */
export type GiftChangeResult = { ok: true; changed: boolean } | { ok: false }

export async function deleteGiftAction(id: string): Promise<GiftChangeResult> {
  const { adminId } = await requireAdmin()
  if (!idSchema.safeParse(id).success) return { ok: false }
  // idempotent: a gift already deleted elsewhere is gone either way
  const deleted = await deleteGift(id)
  const changed = !!deleted
  if (changed) logger.info({ event: 'admin.gift_deleted', giftId: id, adminId }, 'gift deleted')
  if (deleted?.imageKey) await deleteImage(deleted.imageKey, adminId)
  revalidate()
  return { ok: true, changed }
}

export async function releaseGiftAction(id: string): Promise<GiftChangeResult> {
  const { adminId } = await requireAdmin()
  if (!idSchema.safeParse(id).success) return { ok: false }
  // idempotent: a reservation already released (another tab, or the guest) is free either way
  const changed = await adminReleaseGift(id)
  if (changed) logger.info({ event: 'admin.gift_released', giftId: id, adminId }, 'gift released')
  revalidate()
  return { ok: true, changed }
}
