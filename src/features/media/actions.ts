import { requireAdmin } from '@/features/admin-auth/guard'
import { logger } from '@/lib/logger'
import { MAX_AUDIO_BYTES, validateAudioUpload } from './audio'
import { processGiftImage, MAX_UPLOAD_BYTES } from './images'
import { mediaUrl, newGiftImageKey, newMusicKey } from './keys'
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

export type UploadMusicResult = { ok: true; key: string; url: string } | { ok: false; error: string }

export const MUSIC_UPLOAD_ERRORS = {
  too_large: 'A música é grande demais (máx. 8 MB).',
  unsupported: 'Formato não suportado. Use MP3 ou M4A.',
  failed: 'Não foi possível enviar a música. Tente de novo.',
} as const

/**
 * Stores the invite music as music/<uuid>.(mp3|m4a), byte for byte (validated by content first); the
 * settings form saves the key afterwards. Called by POST /admin/api/music (not a Server Action, like the photo).
 */
export async function uploadMusicAction(formData: FormData): Promise<UploadMusicResult> {
  const { adminId } = await requireAdmin()
  const file = formData.get('file')
  if (!(file instanceof Blob) || file.size === 0) return { ok: false, error: MUSIC_UPLOAD_ERRORS.failed }
  if (file.size > MAX_AUDIO_BYTES) return { ok: false, error: MUSIC_UPLOAD_ERRORS.too_large }

  const data = Buffer.from(await file.arrayBuffer())
  const checked = validateAudioUpload(data, file.type)
  if ('error' in checked) {
    logger.info({ event: 'admin.music_rejected', adminId, reason: checked.error }, 'music rejected')
    return {
      ok: false,
      error: checked.error === 'too_large' ? MUSIC_UPLOAD_ERRORS.too_large : checked.error === 'empty' ? MUSIC_UPLOAD_ERRORS.failed : MUSIC_UPLOAD_ERRORS.unsupported,
    }
  }

  const key = newMusicKey(checked.ext)
  try {
    await getStorage().put(key, data, checked.contentType)
  } catch (err) {
    logger.error({ event: 'admin.music_upload_failed', adminId, key, err }, 'music upload failed')
    return { ok: false, error: MUSIC_UPLOAD_ERRORS.failed }
  }
  logger.info({ event: 'admin.music_uploaded', adminId, key, bytes: data.length }, 'music uploaded')
  return { ok: true, key, url: mediaUrl(key) }
}
