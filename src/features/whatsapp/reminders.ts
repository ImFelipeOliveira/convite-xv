// Scheduling of the automatic WhatsApp messages (the dispatcher sends them when due).
// - Confirmed guests (`yes` + phone): reminders D-7 and D-1.
// - Guests who got the invite and haven't answered: one nudge 5 days later and a final notice.
import { isDeadlinePassed } from '@/features/rsvp/deadline'
import type { Guest } from '@/server/db/schema'
import { cancelDispatches, upsertReminder, type ReminderKind } from './dispatches'

/** 10h in America/Boa_Vista (UTC−4, no DST). */
export const REMINDER_TIMES = {
  reminder_d7: new Date('2026-12-20T14:00:00Z'),
  reminder_d1: new Date('2026-12-26T14:00:00Z'),
} as const

/** Final "the deadline is ending" notice for guests still without an answer. */
export const RSVP_FINAL_TIME = new Date('2026-12-10T14:00:00Z')

const NUDGE_DELAY_MS = 5 * 24 * 60 * 60 * 1000

const CONFIRMED_KINDS = ['reminder_d7', 'reminder_d1'] as const satisfies readonly ReminderKind[]
const NUDGE_KINDS = ['rsvp_nudge', 'rsvp_final'] as const satisfies readonly ReminderKind[]

/**
 * Aligns the guest's scheduled rows with their current answer: `yes` + phone → D-7/D-1 for the
 * times still ahead of `now`; otherwise those are cancelled. Any answer cancels the rsvp nudges.
 */
export async function syncRemindersForGuest(
  g: Pick<Guest, 'id' | 'rsvpStatus' | 'phone'>,
  now: Date,
): Promise<void> {
  if (g.rsvpStatus !== 'pending') await cancelDispatches(g.id, NUDGE_KINDS)

  if (g.rsvpStatus === 'yes' && g.phone) {
    for (const kind of CONFIRMED_KINDS) {
      const at = REMINDER_TIMES[kind]
      if (at.getTime() > now.getTime()) await upsertReminder(g.id, kind, at)
    }
  } else {
    await cancelDispatches(g.id, CONFIRMED_KINDS)
  }
}

/** Start of the deadline day in Boa Vista, i.e. the end of "deadline − 1 day". */
function nudgeCutoff(rsvpDeadline: string): Date {
  return new Date(`${rsvpDeadline}T00:00:00-04:00`)
}

/**
 * After an invite is sent to a guest who hasn't answered: nudge at `sentAt` + 5 days (unless that
 * is after the day before the deadline) and the final notice on 10/12 (if still ahead and within
 * the deadline). The one-per-guest index keeps a resend from creating a second row, and
 * `upsertReminder` never resurrects a sent one.
 */
export async function scheduleRsvpNudges(
  g: Pick<Guest, 'id' | 'rsvpStatus'>,
  sentAt: Date,
  rsvpDeadline: string,
): Promise<void> {
  if (g.rsvpStatus !== 'pending') return

  const nudgeAt = new Date(sentAt.getTime() + NUDGE_DELAY_MS)
  if (nudgeAt.getTime() <= nudgeCutoff(rsvpDeadline).getTime()) {
    await upsertReminder(g.id, 'rsvp_nudge', nudgeAt)
  }

  if (RSVP_FINAL_TIME.getTime() > sentAt.getTime() && !isDeadlinePassed(rsvpDeadline, RSVP_FINAL_TIME)) {
    await upsertReminder(g.id, 'rsvp_final', RSVP_FINAL_TIME)
  }
}
