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
 * True when the typed amount reads like a thousands separator ('1.000', '10.000,00', or '1,000' once a
 * typed "." became ","): the form asks for a comma before cents instead of guessing (never R$ 1,00).
 */
export function looksLikeThousands(value: string): boolean {
  return /^\d{1,3}\.\d{3}/.test(value) || /^\d{1,3},\d{3}/.test(value)
}

const PNG_DATA_URL = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/
const RAW_BASE64 = /^[A-Za-z0-9+/=]+$/

/** QR image from Asaas → a safe `src` (base64 PNG only); anything else → null (no image shown). */
export function qrImageSrc(image: string): string | null {
  if (PNG_DATA_URL.test(image)) return image
  if (RAW_BASE64.test(image)) return `data:image/png;base64,${image}`
  return null
}
