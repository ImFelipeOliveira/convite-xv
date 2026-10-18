import { requireAdmin } from '@/features/admin-auth/guard'
import { logger } from '@/lib/logger'
import { processGiftImage, MAX_UPLOAD_BYTES } from './images'
import { mediaUrl, newGiftImageKey } from './keys'
import { getStorage } from './storage'

// Not a Server Action on purpose: called by the POST /admin/api/gift-image route handler, so the 8 MB
// upload doesn't raise the body size limit of every Server Action.

export type UploadGiftImageResult = { ok: true; key: string; previewUrl: string } | { ok: false; error: string }

export const UPLOAD_ERRORS = {
  too_large: 'A foto é grande demais (máx. 8 MB).',
  unsupported: 'Formato não suportado. Use JPG, PNG ou WEBP.',
  failed: 'Não foi possível enviar a foto. Tente de novo.',
} as const

/** Processes the photo and stores it as gifts/<uuid>.webp; the gift form saves the key afterwards. */
export async function uploadGiftImageAction(formData: FormData): Promise<UploadGiftImageResult> {
  const { adminId } = await requireAdmin()
  const file = formData.get('file')
  if (!(file instanceof Blob) || file.size === 0) return { ok: false, error: UPLOAD_ERRORS.failed }
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: UPLOAD_ERRORS.too_large }

  const processed = await processGiftImage(Buffer.from(await file.arrayBuffer()))
  if ('error' in processed) {
    logger.info({ event: 'admin.gift_image_rejected', adminId, reason: processed.error }, 'gift image rejected')
    // a file that claims a supported type but doesn't decode is, for the admin, a format problem too
    return { ok: false, error: processed.error === 'too_large' ? UPLOAD_ERRORS.too_large : UPLOAD_ERRORS.unsupported }
  }

  const key = newGiftImageKey()
  try {
    await getStorage().put(key, processed.data, processed.contentType)
  } catch (err) {
    logger.error({ event: 'admin.gift_image_upload_failed', adminId, key, err }, 'gift image upload failed')
    return { ok: false, error: UPLOAD_ERRORS.failed }
  }
  logger.info({ event: 'admin.gift_image_uploaded', adminId, key, bytes: processed.data.length }, 'gift image uploaded')
  return { ok: true, key, previewUrl: mediaUrl(key) }
}
