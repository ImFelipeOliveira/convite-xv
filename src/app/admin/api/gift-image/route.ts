import { requireAdmin } from '@/features/admin-auth/guard'
import { UPLOAD_ERRORS, uploadGiftImageAction } from '@/features/media/actions'
import { MAX_UPLOAD_BYTES } from '@/features/media/images'
import { handleAdminUpload } from '@/features/media/upload-request'

// Gift photo upload (the gift form posts here, not through a Server Action, so the 8 MB limit applies
// to this route only). The proxy's admin gate covers /admin/*; requireAdmin below is the real check.
export async function POST(request: Request) {
  await requireAdmin()
  return handleAdminUpload(request, { maxFileBytes: MAX_UPLOAD_BYTES, errors: UPLOAD_ERRORS, run: uploadGiftImageAction })
}
