import { describe, expect, it } from 'vitest'
import { isVersionSkewError } from '../version-skew'

class UnrecognizedActionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnrecognizedActionError'
  }
}

describe('isVersionSkewError', () => {
  it("detects the client router's UnrecognizedActionError", () => {
    expect(isVersionSkewError(new UnrecognizedActionError('Server Action "abc" was not found on the server.'))).toBe(true)
    // the name alone is enough (message may change between Next versions)
    expect(isVersionSkewError(new UnrecognizedActionError('whatever'))).toBe(true)
  })

  it('detects the server-side "Failed to find Server Action" message', () => {
    const err = new Error(
      'Failed to find Server Action "7f3a". This request might be from an older or newer deployment.\nRead more: https://nextjs.org/docs/messages/failed-to-find-server-action',
    )
    expect(isVersionSkewError(err)).toBe(true)
    expect(isVersionSkewError(new Error('Server Action unavailable.'))).toBe(true)
  })

  it('ignores unrelated errors and non-errors', () => {
    expect(isVersionSkewError(new Error('Failed to fetch'))).toBe(false)
    expect(isVersionSkewError(new Error('NEXT_REDIRECT'))).toBe(false)
    expect(isVersionSkewError(null)).toBe(false)
    expect(isVersionSkewError('Failed to find Server Action')).toBe(false)
    expect(isVersionSkewError({ message: 42 })).toBe(false)
  })
})
