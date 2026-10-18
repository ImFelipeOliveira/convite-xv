// Invite background music: validation of the admin's upload. Dependency-free, no decoding: the file is
// stored as uploaded (the bytes are never transformed), so the checks are by content, never by name.

import type { MusicExtension } from './keys'

export const MAX_AUDIO_BYTES = 8 * 1024 * 1024

/**
 * MIME types a browser may report for an mp3 / m4a / aac file. An empty type or octet-stream is let
 * through too (some systems don't map .m4a): the magic bytes decide either way.
 */
const DECLARED_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/mpeg3',
  'audio/x-mpeg-3',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/aac',
  'audio/x-aac',
  'audio/aacp',
  'application/octet-stream',
  '',
])

/** MP4 brands of audio files (iTunes/Apple Music, Android recorders, ffmpeg); image brands (heic, avif) stay out. */
const MP4_AUDIO_BRANDS = new Set(['M4A ', 'M4B ', 'M4P ', 'mp41', 'mp42', 'isom', 'iso2', 'iso4', 'iso5', 'iso6', 'dash', 'MSNV', 'NDAS', 'F4A '])

export type AudioKind = { ext: MusicExtension; contentType: 'audio/mpeg' | 'audio/mp4' }
export type AudioError = { error: 'too_large' | 'unsupported' | 'empty' }

/** An MPEG audio Layer III frame header at `at` (sync, a real version, layer III, a real bitrate and sample rate). */
function isMp3Frame(input: Uint8Array, at: number): boolean {
  if (input.length < at + 4) return false
  const [b0, b1, b2] = [input[at], input[at + 1], input[at + 2]]
  if (b0 !== 0xff || (b1 & 0xe0) !== 0xe0) return false
  const version = (b1 >> 3) & 0b11 // 01 is reserved
  const layer = (b1 >> 1) & 0b11 // 01 = layer III
  const bitrate = b2 >> 4 // 0000 free, 1111 bad
  const sampleRate = (b2 >> 2) & 0b11 // 11 reserved
  return version !== 0b01 && layer === 0b01 && bitrate !== 0b1111 && bitrate !== 0 && sampleRate !== 0b11
}

/** Size of a leading ID3v2 tag (header + body + optional footer), or 0 when there is none. */
function id3Length(input: Uint8Array): number {
  if (input.length < 10 || input[0] !== 0x49 || input[1] !== 0x44 || input[2] !== 0x33) return 0 // "ID3"
  const sizeBytes = input.subarray(6, 10)
  if (sizeBytes.some((b) => b & 0x80)) return -1 // synchsafe integers never set the top bit
  const size = (sizeBytes[0] << 21) | (sizeBytes[1] << 14) | (sizeBytes[2] << 7) | sizeBytes[3]
  const footer = input[5] & 0x10 ? 10 : 0
  return 10 + size + footer
}

/** The audio kind from the first bytes: MP3 (optionally behind an ID3v2 tag) or an MP4/M4A container. */
export function detectAudio(input: Uint8Array): AudioKind | null {
  const id3 = id3Length(input)
  if (id3 < 0) return null
  // some encoders pad the tag with a few zero bytes before the first frame
  let at = id3
  while (at < input.length && at < id3 + 1024 && input[at] === 0) at++
  if (isMp3Frame(input, at)) return { ext: 'mp3', contentType: 'audio/mpeg' }
  if (id3 > 0) return null

  if (input.length >= 12) {
    const ascii = (from: number, to: number) => String.fromCharCode(...input.subarray(from, to))
    if (ascii(4, 8) === 'ftyp' && MP4_AUDIO_BRANDS.has(ascii(8, 12))) return { ext: 'm4a', contentType: 'audio/mp4' }
  }
  return null
}

/**
 * Validates an uploaded music file: size cap, a plausible declared type, then the content itself
 * (raw ADTS .aac is not accepted: it can't be seeked reliably and /media serves only mp3 and m4a).
 */
export function validateAudioUpload(input: Uint8Array, declaredType: string): AudioKind | AudioError {
  if (input.length === 0) return { error: 'empty' }
  if (input.length > MAX_AUDIO_BYTES) return { error: 'too_large' }
  if (!DECLARED_TYPES.has(declaredType.toLowerCase().split(';')[0].trim())) return { error: 'unsupported' }
  return detectAudio(input) ?? { error: 'unsupported' }
}
