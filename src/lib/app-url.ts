const DEV_FALLBACK = 'http://localhost:3000'

/** Public base URL of the app. Production requires a valid APP_URL; dev/test fall back to localhost. */
export function getAppUrl(): URL {
  const raw = process.env.APP_URL?.trim()
  if (!raw) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('APP_URL is not set (required in production, e.g. https://convite.example.com)')
    }
    return new URL(DEV_FALLBACK)
  }
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error(`APP_URL is not a valid URL: "${raw}"`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`APP_URL must be an http(s) URL: "${raw}"`)
  }
  return url
}
