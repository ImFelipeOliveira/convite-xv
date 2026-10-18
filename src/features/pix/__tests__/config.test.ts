import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ASAAS_BASE_URLS, readAsaasConfig, testOverridesAllowed } from '../config'

beforeEach(() => {
  vi.stubEnv('ASAAS_API_KEY', 'k')
  vi.stubEnv('ASAAS_ENV', 'sandbox')
  vi.stubEnv('ASAAS_BASE_URL', 'http://127.0.0.1:4120/v3')
  vi.stubEnv('ALLOW_TEST_OVERRIDES', '')
})
afterEach(() => vi.unstubAllEnvs())

describe('test-only overrides', () => {
  it('honours ASAAS_BASE_URL outside production', () => {
    vi.stubEnv('NODE_ENV', 'test')
    expect(testOverridesAllowed()).toBe(true)
    expect(readAsaasConfig()?.baseUrl).toBe('http://127.0.0.1:4120/v3')
  })

  it('ignores ASAAS_BASE_URL in production (the API key never goes elsewhere)', () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(testOverridesAllowed()).toBe(false)
    expect(readAsaasConfig()?.baseUrl).toBe(ASAAS_BASE_URLS.sandbox)
    vi.stubEnv('ASAAS_ENV', 'production')
    expect(readAsaasConfig()?.baseUrl).toBe(ASAAS_BASE_URLS.production)
  })

  it('honours them in a production build only with the explicit e2e opt-in ALLOW_TEST_OVERRIDES=1', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ALLOW_TEST_OVERRIDES', 'true')
    expect(testOverridesAllowed()).toBe(false)
    vi.stubEnv('ALLOW_TEST_OVERRIDES', '1')
    expect(testOverridesAllowed()).toBe(true)
    expect(readAsaasConfig()?.baseUrl).toBe('http://127.0.0.1:4120/v3')
  })
})
