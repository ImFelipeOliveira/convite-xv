import { describe, expect, it } from 'vitest'
import { isValidCpf } from '../cpf'
import { formatCents, parseReais } from '../format'

describe('formatCents', () => {
  it.each([
    [7000, 'R$ 70,00'],
    [5, 'R$ 0,05'],
    [12550, 'R$ 125,50'],
    [125050, 'R$ 1.250,50'],
    [123456789, 'R$ 1.234.567,89'],
  ])('formats %s as %s', (cents, text) => {
    expect(formatCents(cents)).toBe(text)
  })
})

describe('parseReais', () => {
  it.each([
    ['1.250,5', 125050],
    ['70', 7000],
    ['70,00', 7000],
    ['R$ 70,00', 7000],
    [' 150,5 ', 15050],
    ['1250,50', 125050],
    ['1.250', 125000],
    ['70.50', 7050],
    ['1.000.000,01', 100000001],
  ])('parses %j as %s', (text, cents) => {
    expect(parseReais(text)).toBe(cents)
  })

  it.each(['', 'abc', '70,', '70,123', '-70', '1,250.50', '1.25.0', '7 0', '70,5a', '99999999999'])(
    'returns null for %j',
    (text) => {
      expect(parseReais(text)).toBeNull()
    },
  )
})

describe('isValidCpf', () => {
  it.each(['529.982.247-25', '52998224725', '111.444.777-35'])('accepts %s', (cpf) => {
    expect(isValidCpf(cpf)).toBe(true)
  })

  it.each(['', '529.982.247-24', '11111111111', '1234567890', '529982247251', 'abc'])(
    'rejects %j',
    (cpf) => {
      expect(isValidCpf(cpf)).toBe(false)
    },
  )
})
