// "Has this guest already given something?" — used to skip/cancel the gift WhatsApp messages.
import { guestHasActivePaidPix } from '@/features/pix/repo'
import { guestHasGift } from './repo'

type GivenCheck = (guestId: string) => Promise<boolean>

/**
 * Whether the guest has a Pix with status `paid` that was not refunded afterwards.
 * A refund (status stays `paid`, `refundedAt` set) gives the money back, so it no longer counts as a
 * gift: same rule as the admin "Pix recebidos" total. Another paid, unrefunded Pix still counts.
 */
export async function guestHasPaidPix(guestId: string): Promise<boolean> {
  return guestHasActivePaidPix(guestId)
}

/** Every way a guest can have given: a reserved gift, or a paid Pix. */
export const GIVEN_CHECKS: readonly GivenCheck[] = [guestHasGift, guestHasPaidPix]

/** True when any check says the guest already gave (reserved a gift or paid a Pix). */
export async function guestHasGiven(guestId: string, checks: readonly GivenCheck[] = GIVEN_CHECKS): Promise<boolean> {
  for (const check of checks) {
    if (await check(guestId)) return true
  }
  return false
}
