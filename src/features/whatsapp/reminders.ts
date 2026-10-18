// Scheduling of the automatic WhatsApp messages (the dispatcher sends them when due).
// - Confirmed guests (`yes` + phone): reminders D-7 and D-1.
// - Guests who got the invite and haven't answered: one nudge 5 days later and a final notice.
// - Confirmed guests who haven't given yet (gifts flag on): the gift list right after confirming
//   and a gift nudge 5 days later.
import { isFeatureEnabled } from '@/features/event/flags'
import { guestHasGiven } from '@/features/gifts/given'
import { inviteUrl } from '@/features/guests/whatsapp'
import { activePreferredDate, isDeadlinePassed } from '@/features/rsvp/deadline'
import type { Guest, Settings } from '@/server/db/schema'
import { cancelDispatches, upsertReminder, type ReminderKind } from './dispatches'
import type { TemplateValues } from './message'

/** 10h in America/Boa_Vista (UTC−4, no DST). */
export const REMINDER_TIMES = {
  reminder_d7: new Date('2026-12-20T14:00:00Z'),
  reminder_d1: new Date('2026-12-26T14:00:00Z'),
} as const

/** Final "the deadline is ending" notice for guests still without an answer. */
export const RSVP_FINAL_TIME = new Date('2026-12-10T14:00:00Z')

const NUDGE_DELAY_MS = 5 * 24 * 60 * 60 * 1000

/** Gift messages are only scheduled/sent before this (the D-7 reminder, 20/12 10h Boa Vista). */
export const GIFT_MESSAGES_CUTOFF = new Date('2026-12-20T14:00:00Z')

const CONFIRMED_KINDS = ['reminder_d7', 'reminder_d1'] as const satisfies readonly ReminderKind[]
const NUDGE_KINDS = ['rsvp_nudge', 'rsvp_final'] as const satisfies readonly ReminderKind[]
export const GIFT_KINDS = ['gift_list', 'gift_nudge'] as const satisfies readonly ReminderKind[]

export function isGiftKind(kind: ReminderKind): kind is (typeof GIFT_KINDS)[number] {
  return (GIFT_KINDS as readonly ReminderKind[]).includes(kind)
}

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
    await cancelDispatches(g.id, [...CONFIRMED_KINDS, ...GIFT_KINDS])
  }
}

/** Invite link pointing at the gift section. */
export function giftInviteUrl(token: string): string {
  return `${inviteUrl(token)}#gifts`
}

/**
 * Aligns the guest's gift messages with their current state. Eligible = gifts flag on + `yes` +
 * phone + `respondedAt` + hasn't given (no reserved gift, no paid Pix); otherwise both are
 * cancelled. When eligible:
 * - `gift_list` at `respondedAt` (due at once; the dispatcher's quiet hours still apply), only if
 *   before GIFT_MESSAGES_CUTOFF and only on an RSVP (`trigger: 'rsvp'`): releasing a gift never
 *   re-sends the "presence confirmed" message;
 * - `gift_nudge` at `respondedAt` + 5 days when that is ahead of `now` and before the cutoff
 *   (else cancelled).
 * Only guest-driven events call this (RSVP, the guest reserving/releasing): an admin release
 * does not re-arm anything.
 */
export async function syncGiftMessages(
  g: Pick<Guest, 'id' | 'rsvpStatus' | 'phone' | 'respondedAt'>,
  now: Date,
  trigger: 'rsvp' | 'gift',
): Promise<void> {
  const eligible =
    isFeatureEnabled('gifts') &&
    g.rsvpStatus === 'yes' &&
    !!g.phone &&
    !!g.respondedAt &&
    !(await guestHasGiven(g.id))
  if (!eligible || !g.respondedAt) {
    await cancelDispatches(g.id, GIFT_KINDS)
    return
  }

  const respondedAt = g.respondedAt
  if (trigger === 'rsvp' && respondedAt.getTime() < GIFT_MESSAGES_CUTOFF.getTime()) {
    await upsertReminder(g.id, 'gift_list', respondedAt)
  }

  const nudgeAt = new Date(respondedAt.getTime() + NUDGE_DELAY_MS)
  if (nudgeAt.getTime() > now.getTime() && nudgeAt.getTime() < GIFT_MESSAGES_CUTOFF.getTime()) {
    await upsertReminder(g.id, 'gift_nudge', nudgeAt)
  } else {
    await cancelDispatches(g.id, ['gift_nudge'])
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

/**
 * Values for rendering an automatic message (reminders and rsvp nudges) at `now`: `{prazo}` is the
 * deadline and `{preferencia}` the preferred date only while it is still active (see
 * activePreferredDate); a past or unset one falls back to the deadline.
 */
export function reminderTemplateValues(
  settings: Pick<Settings, 'rsvpDeadline' | 'rsvpPreferredDate'>,
  guest: Pick<Guest, 'name' | 'token'>,
  now: Date,
): TemplateValues {
  return {
    name: guest.name,
    link: inviteUrl(guest.token),
    deadline: settings.rsvpDeadline,
    preferredDate: activePreferredDate(settings.rsvpPreferredDate, settings.rsvpDeadline, now),
  }
}
