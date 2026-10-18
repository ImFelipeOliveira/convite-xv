// Dependency-free helpers for object keys of uploaded media (safe to import from views and client code).

/** Uploaded gift photos: unguessable UUID names, always processed to webp. */
const GIFT_IMAGE_KEY = /^gifts\/[0-9a-f-]{36}\.webp$/

export function isGiftImageKey(key: string): boolean {
  return GIFT_IMAGE_KEY.test(key)
}

/**
 * Gift photo key to start the form with after a skew reload: the draft's value when it is '' (photo
 * removed) or a well-formed gift key; anything else in sessionStorage falls back to the saved key.
 */
export function restoredGiftImageKey(draftKey: string | undefined, fallback: string): string {
  return draftKey !== undefined && (draftKey === '' || isGiftImageKey(draftKey)) ? draftKey : fallback
}

export function newGiftImageKey(): string {
  return `gifts/${crypto.randomUUID()}.webp`
}

/** Invite background music uploaded by the admin: unguessable UUID names, mp3 or m4a (never committed to git). */
const MUSIC_KEY = /^music\/[0-9a-f-]{36}\.(mp3|m4a)$/

export type MusicExtension = 'mp3' | 'm4a'

export function isMusicKey(key: string): boolean {
  return MUSIC_KEY.test(key)
}

/** Music key to start the settings form with after a skew reload (same rule as restoredGiftImageKey). */
export function restoredMusicKey(draftKey: string | undefined, fallback: string): string {
  return draftKey !== undefined && (draftKey === '' || isMusicKey(draftKey)) ? draftKey : fallback
}

export function newMusicKey(ext: MusicExtension): string {
  return `music/${crypto.randomUUID()}.${ext}`
}

/** Keys served by /media: gift photos and the invite music. Anything else is a 404. */
export function isMediaKey(key: string): boolean {
  return isGiftImageKey(key) || isMusicKey(key)
}

/** Content-Type served for a media key (only called with a key that passed isMediaKey). */
export function mediaContentType(key: string): string {
  if (key.endsWith('.mp3')) return 'audio/mpeg'
  if (key.endsWith('.m4a')) return 'audio/mp4'
  return 'image/webp'
}

/** Public path served by src/app/media/[...key]/route.ts. */
export function mediaUrl(key: string): string {
  return `/media/${key}`
}
