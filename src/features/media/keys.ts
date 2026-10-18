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

/** Public path served by src/app/media/[...key]/route.ts. */
export function mediaUrl(key: string): string {
  return `/media/${key}`
}
