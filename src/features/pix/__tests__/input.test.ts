import { describe, expect, it } from 'vitest'
import { parseReais } from '../format'
import { looksLikeThousands, maskCpf, maskReais, qrImageSrc } from '../input'

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
  it('flags a "." (or a 3-digit ",") after 1–3 digits: a thousands separator, not cents', () => {
    expect(looksLikeThousands('1.000')).toBe(true)
    expect(looksLikeThousands('10.000')).toBe(true)
    expect(looksLikeThousands('1.000,00')).toBe(true)
    expect(looksLikeThousands('1,000')).toBe(true)
  })

  it('leaves decimals and plain amounts alone', () => {
    for (const v of ['70.5', '100.50', '1000', '1000,00', '1250,5', '70,50', '', '1.00']) {
      expect(looksLikeThousands(v)).toBe(false)
    }
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
