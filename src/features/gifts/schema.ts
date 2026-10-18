import { z } from 'zod'

const HTTPS_ERROR = 'Use um link que comece com https://'
const PRICE_ERROR = 'Valor inválido'

/** pt-BR reais ("250", "250,90", "1.250,00") to cents; empty -> null. */
const MAX_PRICE_CENTS = 100_000_000 // R$ 1.000.000

/** Reais to cents: pt-BR ("250", "250,90", "1.250,00", "R$ 250,90") or an unambiguous dot decimal ("250.90"); empty -> null. */
const priceField = z
  .string()
  .trim()
  .optional()
  .transform((raw, ctx) => {
    const value = (raw ?? '').replace(/^R\$\s*/i, '').trim()
    if (!value) return null
    let whole: string
    let frac = ''
    if (/^(\d{1,3}(\.\d{3})+|\d+)(,\d{1,2})?$/.test(value)) {
      ;[whole, frac = ''] = value.replace(/\./g, '').split(',')
    } else if (/^\d+\.\d{1,2}$/.test(value)) {
      ;[whole, frac] = value.split('.')
    } else {
      ctx.addIssue({ code: 'custom', message: PRICE_ERROR })
      return z.NEVER
    }
    whole = whole.replace(/^0+(?=\d)/, '')
    if (whole.length > 9) {
      ctx.addIssue({ code: 'custom', message: PRICE_ERROR })
      return z.NEVER
    }
    const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'))
    if (cents > MAX_PRICE_CENTS) {
      ctx.addIssue({ code: 'custom', message: PRICE_ERROR })
      return z.NEVER
    }
    return cents
  })

const httpsUrl = z
  .string()
  .trim()
  .optional()
  .transform((value, ctx) => {
    if (!value) return null
    let ok = value.length <= 2048
    if (ok) {
      try {
        const url = new URL(value)
        ok = url.protocol === 'https:' && !url.username && !url.password
      } catch {
        ok = false
      }
    }
    if (!ok) {
      ctx.addIssue({ code: 'custom', message: HTTPS_ERROR })
      return z.NEVER
    }
    return value
  })

export const giftFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Nome obrigatório')
      .max(120, 'Nome deve ter até 120 caracteres'),
    category: z
      .string()
      .trim()
      .max(40, 'Categoria deve ter até 40 caracteres')
      .optional()
      .transform((v) => v || 'Outros'),
    price: priceField,
    purchaseUrl: httpsUrl,
    imageUrl: httpsUrl,
  })
  .transform(({ price, ...rest }) => ({ ...rest, priceCents: price }))

export type GiftFormInput = z.input<typeof giftFormSchema>
export type GiftFormData = z.output<typeof giftFormSchema>
