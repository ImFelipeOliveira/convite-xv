import { describe, expect, it } from 'vitest'
import { compareText, formatBoaVistaDateTime, formatRange, matchesSearch, normalizeText } from '../helpers'

describe('normalizeText', () => {
  it('lowercases, trims and strips accents', () => {
    expect(normalizeText('  Ána Júlia ÇÃO ')).toBe('ana julia cao')
  })
})

describe('matchesSearch', () => {
  it('is accent- and case-insensitive in both directions', () => {
    expect(matchesSearch('Ana Teste', 'ana')).toBe(true)
    expect(matchesSearch('Ana Teste', 'Ána')).toBe(true)
    expect(matchesSearch('João Ávila', 'joao av')).toBe(true)
    expect(matchesSearch('Maria', 'ana')).toBe(false)
  })

  it('matches phones by digits regardless of formatting', () => {
    expect(matchesSearch('(95) 99123-4567', '991234567')).toBe(true)
    expect(matchesSearch('(95) 99123-4567', '95 99123')).toBe(true)
    expect(matchesSearch('(95) 99123-4567', '99999')).toBe(false)
    expect(matchesSearch('Ana 2', 'ana 9')).toBe(false)
  })

  it('treats an empty query as a match and ignores non-text values', () => {
    expect(matchesSearch('Maria', '   ')).toBe(true)
    expect(matchesSearch(null, 'ana')).toBe(false)
    expect(matchesSearch(42, '42')).toBe(true)
  })
})

describe('compareText', () => {
  it('orders pt-BR names ignoring accents and case', () => {
    expect(['Óscar', 'ana', 'Bruno', 'Ábner'].sort(compareText)).toEqual(['Ábner', 'ana', 'Bruno', 'Óscar'])
  })
})

describe('formatRange', () => {
  it('describes the visible slice', () => {
    expect(formatRange(0, 20, 25)).toBe('Mostrando 1–20 de 25')
    expect(formatRange(1, 20, 25)).toBe('Mostrando 21–25 de 25')
    expect(formatRange(0, 20, 3)).toBe('Mostrando 1–3 de 3')
  })

  it('handles an empty result', () => {
    expect(formatRange(0, 20, 0)).toBe('Nenhum resultado')
  })
})

describe('formatBoaVistaDateTime', () => {
  it('formats in America/Boa_Vista (UTC−4)', () => {
    expect(formatBoaVistaDateTime('2026-12-20T14:00:00Z')).toBe('20/12 às 10:00')
    expect(formatBoaVistaDateTime('2026-11-01T02:30:00Z')).toBe('31/10 às 22:30')
  })

  it('returns a dash without a date', () => {
    expect(formatBoaVistaDateTime(null)).toBe('—')
  })
})
