// Pure helpers for the invite's Pix form (client-safe).

/** '52998224725' → '529.982.247-25' as the guest types. */
export function maskCpf(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11)
  let out = d.slice(0, 3)
  if (d.length > 3) out += `.${d.slice(3, 6)}`
  if (d.length > 6) out += `.${d.slice(6, 9)}`
  if (d.length > 9) out += `-${d.slice(9)}`
  return out
}

/**
 * BRL amount as the guest types: digits plus one decimal separator (max 2 decimals). A typed "." is
 * the decimal separator too ('100.50' → '100,50', never 10050), so the field shows no thousands dots.
 */
export function maskReais(value: string): string {
  const [intRaw, ...rest] = value.replace(/\./g, ',').replace(/[^\d,]/g, '').split(',')
  const int = intRaw.replace(/^0+(?=\d)/, '').slice(0, 7)
  if (rest.length === 0) return int
  return `${int || '0'},${rest.join('').slice(0, 2)}`
}

/**
 * True for a dot-only amount that reads like a thousands separator ('1.000', '10.000'): ambiguous, so the
 * form asks to type it without dots instead of guessing (never R$ 1,00). A full pt-BR amount with a comma
 * after the dots ('1.000,00') is not ambiguous: normalizeReaisInput strips its dots.
 */
export function looksLikeThousands(value: string): boolean {
  return /^\d{1,3}\.\d{3}/.test(value) && !value.includes(',')
}

/**
 * The "Outro valor" field as the guest types: '1.000,00' (dots before a comma: pt-BR thousands) → '1000,00';
 * a dot-only thousands amount ('1.000') is kept as typed (the form shows a hint); anything else → maskReais.
 */
export function normalizeReaisInput(typed: string): string {
  const cleaned = typed.replace(/[^\d.,]/g, '')
  if (/\.[^,]*,/.test(cleaned)) return maskReais(cleaned.replace(/\./g, ''))
  if (looksLikeThousands(cleaned)) return cleaned.slice(0, 12)
  return maskReais(typed)
}

export const PAYER_NAME_MIN = 2
export const PAYER_NAME_MAX = 40
export const PAYER_NAME_MESSAGE = 'Digite seu primeiro nome.'
const CONTROL_CHARS = /\p{Cc}/u
const FIRST_NAME =/^[\p{L}\p{M}'\u2019-]+$/u

/** The first word of a full name ('Ana Souza' → 'Ana'): the payer-name field's prefill. */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? ''
}

/**
 * The payer's first name (the Asaas customer name): trimmed, 2–40 characters, a single word of
 * letters (any Unicode letter), apostrophes and hyphens; no control characters. Anything else → null.
 */
export function normalizePayerName(value: string): string | null {
  if (typeof value !== 'string' || CONTROL_CHARS.test(value)) return null
  const name = value.trim()
  if (name.length < PAYER_NAME_MIN || name.length > PAYER_NAME_MAX) return null
  return FIRST_NAME.test(name) ? name : null
}

const PNG_DATA_URL = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/
const RAW_BASE64 = /^[A-Za-z0-9+/=]+$/

/** QR image from Asaas → a safe `src` (base64 PNG only); anything else → null (no image shown). */
export function qrImageSrc(image: string): string | null {
  if (PNG_DATA_URL.test(image)) return image
  if (RAW_BASE64.test(image)) return `data:image/png;base64,${image}`
  return null
}
