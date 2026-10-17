import { parsePhoneNumberFromString } from 'libphonenumber-js'

export function normalizePhone(input: string): string | null {
  const parsed = parsePhoneNumberFromString(input, 'BR')
  return parsed?.isValid() ? parsed.number : null
}

export function formatPhone(e164: string): string {
  const parsed = parsePhoneNumberFromString(e164)
  return parsed ? parsed.formatNational() : e164
}
