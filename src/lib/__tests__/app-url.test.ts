import { afterEach, describe, expect, it, vi } from 'vitest'
import { getAppUrl } from '../app-url'

describe('getAppUrl', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('throws in production when APP_URL is missing', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('APP_URL', undefined)
    expect(() => getAppUrl()).toThrow(/APP_URL is not set/)
  })

  it('throws in production when APP_URL is empty', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('APP_URL', '  ')
    expect(() => getAppUrl()).toThrow(/APP_URL is not set/)
  })

  it('throws when APP_URL has no scheme', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('APP_URL', 'convite.example.com')
    expect(() => getAppUrl()).toThrow(/APP_URL/)
  })

  it('throws when APP_URL is not http(s)', () => {
    vi.stubEnv('APP_URL', 'ftp://convite.example.com')
    expect(() => getAppUrl()).toThrow(/http/)
  })

  it('falls back to localhost outside production', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('APP_URL', undefined)
    expect(getAppUrl().href).toBe('http://localhost:3000/')
  })

  it('returns a valid value', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('APP_URL', 'https://convite.example.com')
    expect(getAppUrl().origin).toBe('https://convite.example.com')
  })
})
