import { describe, expect, it } from 'vitest'
import { detectAudio, MAX_AUDIO_BYTES, validateAudioUpload } from '../audio'
import { mp3WithId3, mp4WithBrand, silentMp3 } from './audio-fixtures'

describe('detectAudio (magic bytes)', () => {
  it('recognizes a bare MP3 frame stream and one behind an ID3v2 tag', () => {
    expect(detectAudio(silentMp3())).toEqual({ ext: 'mp3', contentType: 'audio/mpeg' })
    expect(detectAudio(mp3WithId3())).toEqual({ ext: 'mp3', contentType: 'audio/mpeg' })
  })

  it('recognizes MP4 audio containers (m4a, mp42, isom)', () => {
    for (const brand of ['M4A ', 'mp42', 'isom']) {
      expect(detectAudio(mp4WithBrand(brand)), brand).toEqual({ ext: 'm4a', contentType: 'audio/mp4' })
    }
  })

  it('rejects images in an MP4-like container, other formats and junk', () => {
    expect(detectAudio(mp4WithBrand('heic'))).toBeNull()
    expect(detectAudio(mp4WithBrand('avif'))).toBeNull()
    expect(detectAudio(Buffer.from('RIFF\0\0\0\0WAVEfmt '))).toBeNull()
    expect(detectAudio(Buffer.from('fLaC\0\0\0\x22'))).toBeNull()
    expect(detectAudio(Buffer.from('OggS\0\x02'))).toBeNull()
    expect(detectAudio(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBeNull() // jpeg
    expect(detectAudio(Buffer.from('<script>alert(1)</script>'))).toBeNull()
    expect(detectAudio(Buffer.alloc(0))).toBeNull()
  })

  it('rejects raw ADTS AAC and MP3 lookalike headers (reserved version, other layers, bad bitrate)', () => {
    expect(detectAudio(Buffer.from([0xff, 0xf1, 0x50, 0x80, 0, 0]))).toBeNull() // ADTS
    expect(detectAudio(Buffer.from([0xff, 0xeb, 0x14, 0xc0]))).toBeNull() // reserved MPEG version
    expect(detectAudio(Buffer.from([0xff, 0xfd, 0x14, 0xc0]))).toBeNull() // layer II
    expect(detectAudio(Buffer.from([0xff, 0xfb, 0xf4, 0xc0]))).toBeNull() // bitrate 1111
    expect(detectAudio(Buffer.from([0xff, 0xfb, 0x1c, 0xc0]))).toBeNull() // reserved sample rate
  })

  it('rejects an ID3 tag that is not followed by an MP3 frame or has a broken size', () => {
    const tagThenFlac = Buffer.concat([mp3WithId3(16).subarray(0, 26), Buffer.from('fLaC\0\0\0\x22')])
    expect(detectAudio(tagThenFlac)).toBeNull()
    const broken = mp3WithId3()
    broken[6] = 0x80
    expect(detectAudio(broken)).toBeNull()
  })
})

describe('validateAudioUpload', () => {
  it('accepts mp3/m4a whatever plausible type the browser reports', () => {
    for (const type of ['audio/mpeg', 'audio/mp3', 'audio/x-m4a', 'audio/mp4', 'audio/aac', '', 'application/octet-stream']) {
      expect(validateAudioUpload(silentMp3(), type), type).toEqual({ ext: 'mp3', contentType: 'audio/mpeg' })
    }
    expect(validateAudioUpload(mp4WithBrand('M4A '), 'audio/x-m4a')).toEqual({ ext: 'm4a', contentType: 'audio/mp4' })
  })

  it('trusts the content, not the declared type', () => {
    expect(validateAudioUpload(Buffer.from('not really audio'), 'audio/mpeg')).toEqual({ error: 'unsupported' })
    expect(validateAudioUpload(mp4WithBrand('heic'), 'audio/mp4')).toEqual({ error: 'unsupported' })
  })

  it('refuses a declared type that is clearly not audio, even with audio bytes', () => {
    expect(validateAudioUpload(silentMp3(), 'text/html')).toEqual({ error: 'unsupported' })
    expect(validateAudioUpload(silentMp3(), 'image/svg+xml')).toEqual({ error: 'unsupported' })
    expect(validateAudioUpload(silentMp3(), 'video/mp4')).toEqual({ error: 'unsupported' })
  })

  it('enforces the 8 MB cap and refuses an empty file', () => {
    const atCap = Buffer.concat([silentMp3(), Buffer.alloc(MAX_AUDIO_BYTES - silentMp3().length)])
    expect(validateAudioUpload(atCap, 'audio/mpeg')).toEqual({ ext: 'mp3', contentType: 'audio/mpeg' })
    expect(validateAudioUpload(Buffer.alloc(MAX_AUDIO_BYTES + 1), 'audio/mpeg')).toEqual({ error: 'too_large' })
    expect(validateAudioUpload(Buffer.alloc(0), 'audio/mpeg')).toEqual({ error: 'empty' })
  })
})
