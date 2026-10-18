import { describe, expect, it } from 'vitest'
import { isMediaKey, isMusicKey, mediaContentType, newMusicKey, restoredGiftImageKey, restoredMusicKey } from '../keys'

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

describe('music keys', () => {
  const MUSIC = 'music/0b7c5a52-3f0e-4a8e-9a43-2f7d1c9e6b11.mp3'
  const SAVED_MUSIC = 'music/11111111-2222-4333-8444-555555555555.m4a'

  it('accepts only music/<uuid>.mp3|m4a', () => {
    expect(isMusicKey(MUSIC)).toBe(true)
    expect(isMusicKey(SAVED_MUSIC)).toBe(true)
    for (const bad of [
      'music/0b7c5a52-3f0e-4a8e-9a43-2f7d1c9e6b11.wav',
      'music/0b7c5a52-3f0e-4a8e-9a43-2f7d1c9e6b11.mp3.html',
      'music/../0b7c5a52-3f0e-4a8e-9a43-2f7d1c9e6b11.mp3',
      'music/0B7C5A52-3F0E-4A8E-9A43-2F7D1C9E6B11.mp3',
      'gifts/0b7c5a52-3f0e-4a8e-9a43-2f7d1c9e6b11.mp3',
      '/music/0b7c5a52-3f0e-4a8e-9a43-2f7d1c9e6b11.mp3',
      'music/x.mp3',
      '',
    ]) {
      expect(isMusicKey(bad), bad).toBe(false)
    }
  })

  it('newMusicKey makes a well-formed, unique key per extension', () => {
    const a = newMusicKey('mp3')
    const b = newMusicKey('m4a')
    expect(isMusicKey(a) && a.endsWith('.mp3')).toBe(true)
    expect(isMusicKey(b) && b.endsWith('.m4a')).toBe(true)
    expect(newMusicKey('mp3')).not.toBe(a)
  })

  it('restoredMusicKey follows the gift image rule: draft key if well-formed or empty, else the saved one', () => {
    expect(restoredMusicKey(MUSIC, SAVED_MUSIC)).toBe(MUSIC)
    expect(restoredMusicKey('', SAVED_MUSIC)).toBe('')
    expect(restoredMusicKey(undefined, SAVED_MUSIC)).toBe(SAVED_MUSIC)
    expect(restoredMusicKey('../../etc/passwd', SAVED_MUSIC)).toBe(SAVED_MUSIC)
    expect(restoredMusicKey(SAVED.replace('gifts', 'music'), '')).toBe('')
    expect(restoredMusicKey('https://evil.example/a.mp3', '')).toBe('')
  })

  it('media keys and their content types', () => {
    expect(isMediaKey(MUSIC)).toBe(true)
    expect(isMediaKey(SAVED)).toBe(true)
    expect(isMediaKey('music/x.mp3')).toBe(false)
    expect(mediaContentType(MUSIC)).toBe('audio/mpeg')
    expect(mediaContentType(SAVED_MUSIC)).toBe('audio/mp4')
    expect(mediaContentType(SAVED)).toBe('image/webp')
  })
})
