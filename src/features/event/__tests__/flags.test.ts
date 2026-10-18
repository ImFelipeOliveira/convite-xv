import { afterEach, describe, expect, it, vi } from 'vitest'
import { isFeatureEnabled } from '../flags'

describe('isFeatureEnabled', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('is false when FEATURES is empty', () => {
    vi.stubEnv('FEATURES', '')
    expect(isFeatureEnabled('pix')).toBe(false)
  })

  it('is true for listed features', () => {
    vi.stubEnv('FEATURES', 'gifts, pix')
    expect(isFeatureEnabled('pix')).toBe(true)
    expect(isFeatureEnabled('gifts')).toBe(true)
  })

  it('is false for unlisted features', () => {
    vi.stubEnv('FEATURES', 'gifts')
    expect(isFeatureEnabled('pix')).toBe(false)
  })
})
