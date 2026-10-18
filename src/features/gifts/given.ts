// "Has this guest already given something?" — used to skip/cancel the gift WhatsApp messages.
import { guestHasGift } from './repo'

type GivenCheck = (guestId: string) => Promise<boolean>

/**
 * Whether the guest has a Pix with status `paid` (or `notice_sent`).
 * TODO(pix-merge): OR paid pix — the Pix tables live in the parallel Pix branch; on merge, replace
 * this body with the query (status in ('paid', 'notice_sent')). Nothing else needs to change.
 */
export async function guestHasPaidPix(guestId: string): Promise<boolean> {
  void guestId
  return false
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
