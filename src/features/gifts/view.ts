import { mediaUrl } from '@/features/media/keys'
import type { Gift } from '@/server/db/schema'

/** What a guest may see about a gift: never who reserved it. */
export type GiftView = {
  id: string
  name: string
  category: string
  priceCents: number | null
  /** uploaded photo (/media/...), else the https link, else null */
  imageSrc: string | null
  purchaseUrl: string | null
  state: 'free' | 'mine' | 'taken'
}

/** The uploaded photo wins over a pasted link. */
export function giftImageSrc(g: Pick<Gift, 'imageKey' | 'imageUrl'>): string | null {
  if (g.imageKey) return mediaUrl(g.imageKey)
  return g.imageUrl
}

export function toGiftViews(rows: Gift[], guestId: string): GiftView[] {
  return rows.map((g) => ({
    id: g.id,
    name: g.name,
    category: g.category,
    priceCents: g.priceCents,
    imageSrc: giftImageSrc(g),
    purchaseUrl: g.purchaseUrl,
    state: g.guestId === null ? 'free' : g.guestId === guestId ? 'mine' : 'taken',
  }))
}

/** Names of the gifts this guest reserved, in list order. */
export function chosenGiftNames(views: GiftView[]): string[] {
  return views.filter((g) => g.state === 'mine').map((g) => g.name)
}

/** "Perfume floral", "Perfume floral e mais 2", or null without gifts. */
export function chosenGiftsLabel(names: string[]): string | null {
  if (names.length === 0) return null
  return names.length === 1 ? names[0] : `${names[0]} e mais ${names.length - 1}`
}
