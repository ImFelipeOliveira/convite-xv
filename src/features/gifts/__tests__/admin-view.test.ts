import { describe, expect, it } from 'vitest'
import { formatApproxPrice, giftStatus, priceInputValue } from '../admin-view'

describe('formatApproxPrice', () => {
  it.each([
    [25000, '≈ R$ 250'],
    [25090, '≈ R$ 250,90'],
    [125000, '≈ R$ 1.250'],
    [0, '≈ R$ 0'],
    [null, '—'],
  ])('formats %s as %s', (cents, text) => {
    expect(formatApproxPrice(cents)).toBe(text)
  })
})

describe('priceInputValue', () => {
  it.each([
    [25000, '250'],
    [25090, '250,90'],
    [125000, '1250'],
    [null, ''],
  ])('turns %s into the form value %s', (cents, text) => {
    expect(priceInputValue(cents)).toBe(text)
  })
})

describe('giftStatus', () => {
  it('is free without a reserver', () => {
    expect(giftStatus({ guestId: null, reservedByStatus: null })).toBe('free')
  })
  it('is reserved by a guest who did not decline', () => {
    expect(giftStatus({ guestId: 'g', reservedByStatus: 'yes' })).toBe('reserved')
    expect(giftStatus({ guestId: 'g', reservedByStatus: 'pending' })).toBe('reserved')
  })
  it('flags a reservation by a guest who declined the invite', () => {
    expect(giftStatus({ guestId: 'g', reservedByStatus: 'no' })).toBe('declined')
  })
})
