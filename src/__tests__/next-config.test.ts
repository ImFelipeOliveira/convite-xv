// @ts-expect-error -- Next's vendored copy ships without types
import { pathToRegexp } from 'next/dist/compiled/path-to-regexp'
import { afterEach, describe, expect, it, vi } from 'vitest'
import nextConfig from '../../next.config'

type Rule = { source: string; headers: { key: string; value: string }[] }

/** The headers Next would send for `path`: every matching rule in order, a later key overriding an earlier one. */
async function headersFor(path: string): Promise<Record<string, string>> {
  const rules = ((await nextConfig.headers?.()) ?? []) as Rule[]
  const out: Record<string, string> = {}
  for (const rule of rules) {
    if (!(pathToRegexp(rule.source) as RegExp).test(path)) continue
    for (const h of rule.headers) out[h.key.toLowerCase()] = h.value
  }
  return out
}

afterEach(() => vi.unstubAllEnvs())

describe('security headers (next.config)', () => {
  it('turns off X-Powered-By', () => {
    expect(nextConfig.poweredByHeader).toBe(false)
  })

  it.each(['/', '/c/AnyToken0000000000000', '/admin', '/admin/guests', '/media/gifts/x.webp', '/api/health'])(
    'sends the baseline on %s',
    async (path) => {
      const h = await headersFor(path)
      expect(h['x-content-type-options']).toBe('nosniff')
      expect(h['x-frame-options']).toBe('DENY')
      expect(h['content-security-policy']).toBe("frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
      expect(h['permissions-policy']).toMatch(/camera=\(\)/)
      expect(h['permissions-policy']).toMatch(/microphone=\(\)/)
      expect(h['permissions-policy']).toMatch(/geolocation=\(\)/)
    },
  )

  it('never sends a script-src CSP (it would break Next inline scripts)', async () => {
    expect((await headersFor('/'))['content-security-policy']).not.toMatch(/script-src|default-src/)
  })

  it('uses strict-origin-when-cross-origin, and no-referrer on the invite (its URL carries the token)', async () => {
    expect((await headersFor('/'))['referrer-policy']).toBe('strict-origin-when-cross-origin')
    expect((await headersFor('/admin/guests'))['referrer-policy']).toBe('strict-origin-when-cross-origin')
    expect((await headersFor('/c/AnyToken0000000000000'))['referrer-policy']).toBe('no-referrer')
    expect((await headersFor('/c/AnyToken0000000000000/calendar.ics'))['referrer-policy']).toBe('no-referrer')
  })

  it('sends HSTS only for a production build served over https', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('APP_URL', 'https://isabella15.example')
    expect((await headersFor('/'))['strict-transport-security']).toBe('max-age=31536000; includeSubDomains')
    expect((await headersFor('/c/AnyToken0000000000000'))['strict-transport-security']).toBe(
      'max-age=31536000; includeSubDomains',
    )

    // e2e: `next start` (production) on http://localhost
    vi.stubEnv('APP_URL', 'http://localhost:3100')
    expect((await headersFor('/'))['strict-transport-security']).toBeUndefined()

    // next dev
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('APP_URL', 'https://isabella15.example')
    expect((await headersFor('/'))['strict-transport-security']).toBeUndefined()
  })
})
