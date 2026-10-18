import { describe, expect, it } from 'vitest'
import { restoredGiftImageKey } from '../keys'

const SAVED = 'gifts/11111111-2222-4333-8444-555555555555.webp'
const UPLOADED = 'gifts/0b7c5a52-3f0e-4a8e-9a43-2f7d1c9e6b11.webp'

describe('restoredGiftImageKey', () => {
  it('uses a well-formed uploaded key or an empty one (photo removed) from the draft', () => {
    expect(restoredGiftImageKey(UPLOADED, SAVED)).toBe(UPLOADED)
    expect(restoredGiftImageKey('', SAVED)).toBe('')
  })

  it('falls back to the saved key when the draft has none or a tampered one', () => {
    expect(restoredGiftImageKey(undefined, SAVED)).toBe(SAVED)
    expect(restoredGiftImageKey('../secrets.txt', SAVED)).toBe(SAVED)
    expect(restoredGiftImageKey('gifts/x.webp', SAVED)).toBe(SAVED)
    expect(restoredGiftImageKey('https://evil.example/a.webp', '')).toBe('')
  })
})
