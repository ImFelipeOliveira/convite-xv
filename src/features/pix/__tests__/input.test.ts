import { describe, expect, it } from 'vitest'
import { parseReais } from '../format'
import { firstName, looksLikeThousands, maskCpf, maskReais, normalizePayerName, normalizeReaisInput, qrImageSrc } from '../input'

describe('maskReais', () => {
  it('treats a typed "." as the decimal separator', () => {
    expect(maskReais('70.5')).toBe('70,5')
    expect(maskReais('100.50')).toBe('100,50')
    expect(parseReais(maskReais('70.5'))).toBe(7050)
    expect(parseReais(maskReais('100.50'))).toBe(10050)
  })

  it('keeps digits and one decimal separator with at most 2 decimals', () => {
    expect(maskReais('1250')).toBe('1250')
    expect(maskReais('1250,5')).toBe('1250,5')
    expect(maskReais('12,345')).toBe('12,34')
    expect(maskReais('1,2,3')).toBe('1,23')
    expect(maskReais('R$ 80')).toBe('80')
    expect(maskReais(',5')).toBe('0,5')
    expect(maskReais('007')).toBe('7')
    expect(maskReais('12345678')).toBe('1234567')
  })
})

describe('looksLikeThousands', () => {
  it('flags a dot-only thousands separator ("1.000"): ambiguous, so the form asks to type without dots', () => {
    expect(looksLikeThousands('1.000')).toBe(true)
    expect(looksLikeThousands('10.000')).toBe(true)
    expect(looksLikeThousands('1.000.000')).toBe(true)
  })

  it('leaves decimals, plain amounts and full pt-BR amounts ("1.000,00") alone', () => {
    for (const v of ['70.5', '100.50', '1000', '1000,00', '1250,5', '70,50', '', '1.00', '1.000,00', '10.000,5', '1,000']) {
      expect(looksLikeThousands(v)).toBe(false)
    }
  })
})

describe('normalizeReaisInput', () => {
  it('reads "1.000,00" (dots before a comma) as pt-BR thousands: strips the dots', () => {
    expect(normalizeReaisInput('1.000,00')).toBe('1000,00')
    expect(normalizeReaisInput('1.000,')).toBe('1000,')
    expect(normalizeReaisInput('R$ 2.500,5')).toBe('2500,5')
    expect(parseReais(normalizeReaisInput('1.000,00'))).toBe(100000)
  })

  it('keeps a dot-only thousands amount as typed (the form shows the hint)', () => {
    expect(normalizeReaisInput('1.000')).toBe('1.000')
    expect(normalizeReaisInput('R$ 10.000')).toBe('10.000')
  })

  it('otherwise masks like maskReais (a typed "." is the decimal separator)', () => {
    expect(normalizeReaisInput('70.5')).toBe('70,5')
    expect(normalizeReaisInput('1250')).toBe('1250')
    expect(normalizeReaisInput('12,345')).toBe('12,34')
  })
})

describe('maskCpf', () => {
  it('masks as 000.000.000-00 while typing', () => {
    expect(maskCpf('529')).toBe('529')
    expect(maskCpf('5299822')).toBe('529.982.2')
    expect(maskCpf('52998224725')).toBe('529.982.247-25')
    expect(maskCpf('529.982.247-25999')).toBe('529.982.247-25')
  })
})

describe('qrImageSrc', () => {
  it('prefixes raw base64 and accepts a base64 PNG data URL', () => {
    expect(qrImageSrc('iVBORw0KGgo=')).toBe('data:image/png;base64,iVBORw0KGgo=')
    expect(qrImageSrc('data:image/png;base64,iVBOR+/w0=')).toBe('data:image/png;base64,iVBOR+/w0=')
  })

  it('rejects anything else', () => {
    expect(qrImageSrc('')).toBeNull()
    expect(qrImageSrc('https://evil.example/qr.png')).toBeNull()
    expect(qrImageSrc('data:image/svg+xml;base64,PHN2Zz4=')).toBeNull()
    expect(qrImageSrc('javascript:alert(1)')).toBeNull()
    expect(qrImageSrc('data:image/png;base64,abc"onerror')).toBeNull()
  })
})

describe('normalizePayerName', () => {
  it('accepts a single first name, trimmed', () => {
    expect(normalizePayerName('  Maria ')).toBe('Maria')
    expect(normalizePayerName('Jo')).toBe('Jo')
  })

  it('accepts any Unicode letter, apostrophe and hyphen', () => {
    for (const ok of ['José', 'Zoë', 'Ângela', 'Łukasz', 'Ana-Clara', "D'Ávila", 'D’Ávila', '李雷']) {
      expect(normalizePayerName(ok)).toBe(ok)
    }
  })

  it('takes 2 to 40 characters after trimming', () => {
    expect(normalizePayerName(' A ')).toBeNull()
    expect(normalizePayerName('')).toBeNull()
    expect(normalizePayerName('a'.repeat(40))).toBe('a'.repeat(40))
    expect(normalizePayerName('a'.repeat(41))).toBeNull()
  })

  it('rejects several words, digits, symbols and control characters', () => {
    for (const bad of ['Maria Silva', 'Maria1', 'Ma_ria', 'Maria@', 'Maria\nSilva', 'Maria\t', 'Maria\u0000', '\u007fMaria']) {
      expect(normalizePayerName(bad)).toBeNull()
    }
  })
})

describe('firstName', () => {
  it('is the first word of the full name', () => {
    expect(firstName('  Ana   Souza ')).toBe('Ana')
    expect(firstName('Maria')).toBe('Maria')
    expect(firstName('')).toBe('')
  })
})
