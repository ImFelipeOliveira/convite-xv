import { requireAdmin } from '@/features/admin-auth/guard'
import { UPLOAD_ERRORS, uploadGiftImageAction } from '@/features/media/actions'
import { MAX_UPLOAD_BYTES } from '@/features/media/images'

// Gift photo upload (the gift form posts here, not through a Server Action, so the 8 MB limit applies
// to this route only). The proxy's admin gate covers /admin/*; requireAdmin below is the real check.

// room for the multipart envelope around the file
const MAX_BODY_BYTES = MAX_UPLOAD_BYTES + 64 * 1024

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return true
  let host: string
  try {
    host = new URL(origin).host
  } catch {
    return false
  }
  const allowed = [new URL(request.url).host, request.headers.get('host'), request.headers.get('x-forwarded-host')]
  return allowed.includes(host)
}

export async function POST(request: Request) {
  await requireAdmin()
  // Server Actions check the origin themselves; a route handler has to (the session cookie is SameSite=Lax too)
  if (!sameOrigin(request)) return Response.json({ ok: false, error: UPLOAD_ERRORS.failed }, { status: 403 })

  const length = Number(request.headers.get('content-length') ?? 0)
  if (length > MAX_BODY_BYTES) return Response.json({ ok: false, error: UPLOAD_ERRORS.too_large }, { status: 413 })

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return Response.json({ ok: false, error: UPLOAD_ERRORS.failed }, { status: 400 })
  }
  const result = await uploadGiftImageAction(formData)
  return Response.json(result, { status: result.ok ? 200 : 422 })
}
