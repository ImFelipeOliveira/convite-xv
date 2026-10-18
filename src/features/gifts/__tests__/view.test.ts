import { describe, expect, it } from 'vitest'
import { chosenGiftsLabel, chosenGiftNames, type GiftView } from '../view'

const view = (name: string, state: GiftView['state']): GiftView => ({
  id: name,
  name,
  category: 'Beleza',
  priceCents: null,
  imageUrl: null,
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
