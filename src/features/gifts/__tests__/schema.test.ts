import { describe, expect, it } from 'vitest'
import { giftFormSchema } from '../schema'

const parse = (o: Record<string, unknown>) => giftFormSchema.safeParse({ name: 'Panela', ...o })

describe('giftFormSchema', () => {
  it.each([
    ['250', 25000],
    ['250,90', 25090],
    ['1.250,00', 125000],
    ['0', 0],
    ['250.90', 25090],
    ['1.25', 125],
    ['1.250', 125000],
    ['R$ 250,90', 25090],
    ['1.000.000,00', 100000000],
  ])('parses price %s into %i cents', (price, cents) => {
    const r = parse({ price })
    expect(r.success && r.data.priceCents).toBe(cents)
  })

  it('turns an empty price into null', () => {
    const r = parse({ price: '  ' })
    expect(r.success && r.data.priceCents).toBeNull()
  })

  it('rejects an invalid or negative price', () => {
    expect(parse({ price: 'abc' }).success).toBe(false)
    expect(parse({ price: '-5' }).success).toBe(false)
  })

  it('rejects prices above R$ 1.000.000 and absurdly long numbers', () => {
    expect(parse({ price: '1.000.000,01' }).success).toBe(false)
    expect(parse({ price: '9'.repeat(30) }).success).toBe(false)
    expect(parse({ price: '9'.repeat(30) + ',99' }).success).toBe(false)
  })

  it('defaults and trims the category', () => {
    const a = parse({})
    expect(a.success && a.data.category).toBe('Outros')
    const b = parse({ category: '  Cozinha ' })
    expect(b.success && b.data.category).toBe('Cozinha')
  })

  it('requires a name up to 120 chars', () => {
    expect(giftFormSchema.safeParse({ name: ' ' }).success).toBe(false)
    expect(parse({ name: 'a'.repeat(121) }).success).toBe(false)
  })

  it('accepts https links and turns empty links into null', () => {
    const r = parse({ purchaseUrl: 'https://loja.com/x', imageUrl: '' })
    expect(r.success && r.data.purchaseUrl).toBe('https://loja.com/x')
    expect(r.success && r.data.imageUrl).toBeNull()
  })

  it.each([
    ['http://loja.com'],
    ['javascript:alert(1)'],
    ['loja.com'],
    ['https://user:pass@loja.com/x'],
    ['https://' + 'a'.repeat(2050)],
  ])(
    'rejects link %s',
    (purchaseUrl) => {
      const r = parse({ purchaseUrl })
      expect(r.success).toBe(false)
    },
  )

  it('uses the https message', () => {
    const r = parse({ imageUrl: 'http://x.com/a.png' })
    expect(!r.success && r.error.issues[0].message).toBe('Use um link que comece com https://')
  })
})
