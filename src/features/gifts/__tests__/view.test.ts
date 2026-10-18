import { describe, expect, it } from 'vitest'
import type { Gift } from '@/server/db/schema'
import { chosenGiftsLabel, chosenGiftNames, toGiftViews, type GiftView } from '../view'

const view = (name: string, state: GiftView['state']): GiftView => ({
  id: name,
  name,
  category: 'Beleza',
  priceCents: null,
  imageSrc: null,
  purchaseUrl: null,
  state,
})

describe('chosenGiftNames', () => {
  it('keeps only the guest own reservations, in list order', () => {
    expect(chosenGiftNames([view('A', 'mine'), view('B', 'taken'), view('C', 'free'), view('D', 'mine')])).toEqual([
      'A',
      'D',
    ])
  })
})

describe('chosenGiftsLabel', () => {
  it('names a single gift', () => {
    expect(chosenGiftsLabel(['Perfume floral'])).toBe('Perfume floral')
  })

  it('names the first and counts the rest', () => {
    expect(chosenGiftsLabel(['Perfume', 'Bolsa'])).toBe('Perfume e mais 1')
    expect(chosenGiftsLabel(['Perfume', 'Bolsa', 'Fone'])).toBe('Perfume e mais 2')
  })

  it('is null without gifts', () => {
    expect(chosenGiftsLabel([])).toBeNull()
  })
})

describe('toGiftViews imageSrc', () => {
  const row = (imageUrl: string | null, imageKey: string | null) =>
    ({
      id: 'g1',
      name: 'Perfume',
      category: 'Beleza',
      priceCents: null,
      imageUrl,
      imageKey,
      purchaseUrl: null,
      sortOrder: 0,
      guestId: null,
      reservedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }) satisfies Gift

  it('prefers the uploaded photo, then the https link, else null', () => {
    const key = 'gifts/0b0e6b3c-3f43-4a52-9a43-2f6a6b4c1d2e.webp'
    expect(toGiftViews([row('https://loja.com/a.jpg', key)], 'x')[0].imageSrc).toBe(`/media/${key}`)
    expect(toGiftViews([row('https://loja.com/a.jpg', null)], 'x')[0].imageSrc).toBe('https://loja.com/a.jpg')
    expect(toGiftViews([row(null, null)], 'x')[0].imageSrc).toBeNull()
  })
})
