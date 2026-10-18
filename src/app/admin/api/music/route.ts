import { requireAdmin } from '@/features/admin-auth/guard'
import { MUSIC_UPLOAD_ERRORS, uploadMusicAction } from '@/features/media/actions'
import { MAX_AUDIO_BYTES } from '@/features/media/audio'
import { handleAdminUpload } from '@/features/media/upload-request'

// Invite music upload (Painel → Configurações posts here; the 8 MB limit applies to this route only).
// The proxy's admin gate covers /admin/*; requireAdmin below is the real check, before anything is read.
export async function POST(request: Request) {
  await requireAdmin()
  return handleAdminUpload(request, { maxFileBytes: MAX_AUDIO_BYTES, errors: MUSIC_UPLOAD_ERRORS, run: uploadMusicAction })
}
