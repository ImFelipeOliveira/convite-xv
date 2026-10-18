'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdmin } from '@/features/admin-auth/guard'
import { logger } from '@/lib/logger'
import { adminReleaseGift, createGift, deleteGift, updateGift } from './repo'
import { giftFormSchema } from './schema'

const GIFTS_PATH = '/admin/gifts'
const SUMMARY_PATH = '/admin'
const NOT_FOUND = 'Presente não encontrado.'

export type GiftField = 'name' | 'category' | 'price' | 'purchaseUrl' | 'imageUrl' | 'sortOrder'
const FIELDS: GiftField[] = ['name', 'category', 'price', 'purchaseUrl', 'imageUrl', 'sortOrder']

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

  const gift = id ? await updateGift(id, parsed.data) : await createGift(parsed.data)
  if (!gift) return { ok: false, error: NOT_FOUND, values }
  logger.info({ event: 'admin.gift_saved', giftId: gift.id, adminId }, 'gift saved')
  revalidate()
  return { ok: true, message: 'Presente salvo.' }
}

export async function deleteGiftAction(id: string): Promise<{ ok: boolean }> {
  const { adminId } = await requireAdmin()
  if (!idSchema.safeParse(id).success) return { ok: false }
  // idempotent: a gift already deleted elsewhere is gone either way
  if (await deleteGift(id)) logger.info({ event: 'admin.gift_deleted', giftId: id, adminId }, 'gift deleted')
  revalidate()
  return { ok: true }
}

export async function releaseGiftAction(id: string): Promise<{ ok: boolean }> {
  const { adminId } = await requireAdmin()
  if (!idSchema.safeParse(id).success) return { ok: false }
  // idempotent: a reservation already released (another tab, or the guest) is free either way
  if (await adminReleaseGift(id)) logger.info({ event: 'admin.gift_released', giftId: id, adminId }, 'gift released')
  revalidate()
  return { ok: true }
}
