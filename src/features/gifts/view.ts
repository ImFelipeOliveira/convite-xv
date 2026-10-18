import type { Gift } from '@/server/db/schema'

/** What a guest may see about a gift: never who reserved it. */
export type GiftView = {
  id: string
  name: string
  category: string
  priceCents: number | null
  imageUrl: string | null
  purchaseUrl: string | null
  state: 'free' | 'mine' | 'taken'
}

export function toGiftViews(rows: Gift[], guestId: string): GiftView[] {
  return rows.map((g) => ({
    id: g.id,
    name: g.name,
    category: g.category,
    priceCents: g.priceCents,
    imageUrl: g.imageUrl,
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
