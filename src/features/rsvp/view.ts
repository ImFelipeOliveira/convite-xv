import type { Guest } from '@/server/db/schema'

/** What the RSVP screen needs about a guest. Never carries the phone itself, only whether one is on file. */
export type RsvpGuestView = {
  name: string
  rsvpStatus: Guest['rsvpStatus']
  plusOnes: number
  message: string | null
  plusOnesLimit: number
  hasPhone: boolean
  /** ISO 8601 */
  respondedAt: string | null
}

export function toRsvpGuestView(guest: Guest): RsvpGuestView {
  return {
    name: guest.name,
    rsvpStatus: guest.rsvpStatus,
    plusOnes: guest.plusOnes,
    message: guest.message,
    plusOnesLimit: guest.plusOnesLimit,
    hasPhone: guest.phone !== null,
    respondedAt: guest.respondedAt ? guest.respondedAt.toISOString() : null,
  }
}
