import { describe, expect, it } from 'vitest'
import { parseReais } from '../format'
import { looksLikeThousands, maskCpf, maskReais, normalizePayerName, normalizeReaisInput, qrImageSrc } from '../input'

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
  it('trims and collapses inner spaces of a full name', () => {
    expect(normalizePayerName('  Maria   da Silva ')).toBe('Maria da Silva')
    expect(normalizePayerName('Ana Souza')).toBe('Ana Souza')
    expect(normalizePayerName('Jo Li')).toBe('Jo Li')
  })

  it('needs at least two words', () => {
    expect(normalizePayerName('Maria')).toBeNull()
    expect(normalizePayerName('   Maria   ')).toBeNull()
    expect(normalizePayerName('')).toBeNull()
  })

  it('takes 3 to 100 characters after trimming', () => {
    expect(normalizePayerName('A B')).toBe('A B')
    expect(normalizePayerName(' A ')).toBeNull()
    const long = `Maria ${'a'.repeat(94)}`
    expect(long).toHaveLength(100)
    expect(normalizePayerName(long)).toBe(long)
    expect(normalizePayerName(`${long}a`)).toBeNull()
  })

  it('rejects control characters', () => {
    expect(normalizePayerName('Maria\nSilva')).toBeNull()
    expect(normalizePayerName('Maria\tSilva')).toBeNull()
    expect(normalizePayerName('Maria Silva\u0000')).toBeNull()
    expect(normalizePayerName('Maria \u007fSilva')).toBeNull()
  })
})
