import { describe, expect, it } from 'vitest'
import { formatPhone, normalizePhone } from '../phone'

describe('normalizePhone', () => {
  it.each([
    ['(95) 99123-4567', '+5595991234567'],
    ['95991234567', '+5595991234567'],
    ['+55 95 99123-4567', '+5595991234567'],
    ['(95) 3224-1234', '+559532241234'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected)
  })
  it('returns null for invalid input', () => {
    expect(normalizePhone('123')).toBeNull()
    expect(normalizePhone('')).toBeNull()
  })
})

describe('formatPhone', () => {
  it('formats E.164 as national', () => {
    expect(formatPhone('+5595991234567')).toBe('(95) 99123-4567')
  })
})
