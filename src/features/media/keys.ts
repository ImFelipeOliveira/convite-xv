// Dependency-free helpers for object keys of uploaded media (safe to import from views and client code).

/** Uploaded gift photos: unguessable UUID names, always processed to webp. */
const GIFT_IMAGE_KEY = /^gifts\/[0-9a-f-]{36}\.webp$/

export function isGiftImageKey(key: string): boolean {
  return GIFT_IMAGE_KEY.test(key)
}

export function newGiftImageKey(): string {
  return `gifts/${crypto.randomUUID()}.webp`
}

/** Public path served by src/app/media/[...key]/route.ts. */
export function mediaUrl(key: string): string {
  return `/media/${key}`
}
