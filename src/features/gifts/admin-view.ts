// Pure helpers for the admin gift catalog (no React, unit-tested).
import type { RsvpStatus } from '@/server/db/schema'

export type AdminGiftStatus = 'free' | 'reserved' | 'declined'

/** "Reserva de quem recusou" = reserved by a guest whose RSVP is `no`; the three values don't overlap. */
export function giftStatus(g: { guestId: string | null; reservedByStatus: RsvpStatus | null }): AdminGiftStatus {
  if (!g.guestId) return 'free'
  return g.reservedByStatus === 'no' ? 'declined' : 'reserved'
}

const money = (cents: number) =>
  new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)

/** "≈ R$ 250", "≈ R$ 250,90" or "—". */
export function formatApproxPrice(cents: number | null): string {
  return cents === null ? '—' : `≈ R$ ${money(cents)}`
}

/** Value for the price input (parsed back by giftFormSchema): "250", "250,90", "" */
export function priceInputValue(cents: number | null): string {
  if (cents === null) return ''
  const whole = Math.floor(cents / 100)
  const frac = cents % 100
  return frac === 0 ? String(whole) : `${whole},${String(frac).padStart(2, '0')}`
}
