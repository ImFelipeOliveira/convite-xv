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
