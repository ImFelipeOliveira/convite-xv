// Shared plumbing of the admin upload route handlers (gift photo, invite music). Each route calls
// requireAdmin itself first; this only checks the origin, caps the body and parses the multipart form.

/**
 * Same-origin proof: a matching Origin header, or (no Origin) `Sec-Fetch-Site: same-origin`. A request
 * with neither (no browser sends a cross-site POST like that, but a non-browser client could) is refused.
 */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return request.headers.get('sec-fetch-site') === 'same-origin'
  let host: string
  try {
    host = new URL(origin).host
  } catch {
    return false
  }
  const allowed = [new URL(request.url).host, request.headers.get('host'), request.headers.get('x-forwarded-host')]
  return allowed.includes(host)
}

/** The whole body, or 'too_large' as soon as it passes `max` bytes (the rest is never read). */
export async function readCapped(request: Request, max: number): Promise<Uint8Array<ArrayBuffer> | 'too_large'> {
  if (!request.body) return new Uint8Array(0)
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > max) {
      await reader.cancel().catch(() => {})
      return 'too_large'
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  return out
}

type UploadResult = { ok: true } | { ok: false; error: string }

/**
 * Same-origin check, size cap (Content-Length first, then the bytes actually read) and multipart parsing;
 * `run` gets the form data. Errors answer `{ ok: false, error }` with the route's own copy.
 */
export async function handleAdminUpload<R extends UploadResult>(
  request: Request,
  options: { maxFileBytes: number; errors: { too_large: string; failed: string }; run: (formData: FormData) => Promise<R> },
): Promise<Response> {
  const { errors } = options
  // Server Actions check the origin themselves; a route handler has to (the session cookie is SameSite=Lax too)
  if (!sameOrigin(request)) return Response.json({ ok: false, error: errors.failed }, { status: 403 })

  // room for the multipart envelope around the file
  const maxBody = options.maxFileBytes + 64 * 1024
  const length = Number(request.headers.get('content-length') ?? 0)
  if (length > maxBody) return Response.json({ ok: false, error: errors.too_large }, { status: 413 })

  // Content-Length can be missing (chunked) or wrong: count the bytes as they arrive and stop past the cap
  const body = await readCapped(request, maxBody)
  if (body === 'too_large') return Response.json({ ok: false, error: errors.too_large }, { status: 413 })

  let formData: FormData
  try {
    formData = await new Response(body, { headers: { 'content-type': request.headers.get('content-type') ?? '' } }).formData()
  } catch {
    return Response.json({ ok: false, error: errors.failed }, { status: 400 })
  }
  const result = await options.run(formData)
  return Response.json(result, { status: result.ok ? 200 : 422 })
}
