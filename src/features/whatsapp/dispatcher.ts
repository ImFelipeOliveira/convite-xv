// Sends the automatic WhatsApp messages (reminders D-7/D-1 and rsvp nudges) when due.
// Runs inside the Next.js server process (started from src/instrumentation.ts).
import { EVENT } from '@/features/event/event'
import { findGuestById } from '@/features/guests/repo'
import { isDeadlinePassed } from '@/features/rsvp/deadline'
import { getSettings } from '@/features/settings/repo'
import { logger } from '@/lib/logger'
import type { Guest, MessageDispatch, Settings } from '@/server/db/schema'
import { readEvolutionConfig } from './config'
import {
  claimDueReminder,
  deferDueReminders,
  deferReminder,
  markDispatchCancelled,
  markDispatchFailed,
  markDispatchSent,
  recoverStuckSending,
  rescheduleReminder,
  type ReminderKind,
} from './dispatches'
import { getConnectionState, sendText } from './evolution'
import { renderTemplate, varyGreeting } from './message'
import { REMINDER_TIMES, reminderTemplateValues } from './reminders'

export type DispatcherDeps = {
  now: () => Date
  sleep: (ms: number) => Promise<void>
  random: () => number
  sendText: typeof sendText
  getConnectionState: typeof getConnectionState
  readEvolutionConfig: typeof readEvolutionConfig
}

export type DispatcherTickResult = {
  sent: number
  failed: number
  skipped: 'not_configured' | 'not_connected' | 'quiet_hours' | null
}

const MAX_ATTEMPTS = 3
const MAX_SENDS_PER_TICK = 30
const MIN = 60 * 1000
const NOT_CONNECTED_DELAY_MS = 5 * MIN
const TICK_INTERVAL_MS = 60_000

/** Which guest answer each kind requires and which settings text it sends. */
const KIND_RULES: Record<ReminderKind, { rsvpStatus: Guest['rsvpStatus']; text: (s: Settings) => string }> = {
  reminder_d7: { rsvpStatus: 'yes', text: (s) => s.reminderD7Text },
  reminder_d1: { rsvpStatus: 'yes', text: (s) => s.reminderD1Text },
  rsvp_nudge: { rsvpStatus: 'pending', text: (s) => s.rsvpNudgeText },
  rsvp_final: { rsvpStatus: 'pending', text: (s) => s.rsvpFinalText },
}

const BOA_VISTA_OFFSET_MS = 4 * 60 * MIN // UTC−4, no DST
const SEND_FROM_HOUR = 9
const SEND_UNTIL_HOUR = 20
const EVENT_STARTS_AT = new Date(EVENT.startsAt)

/** Automatic sends only happen between 09:00 and 20:00 (exclusive) in Boa Vista. */
export function isWithinSendingHours(now: Date): boolean {
  const hour = new Date(now.getTime() - BOA_VISTA_OFFSET_MS).getUTCHours()
  return hour >= SEND_FROM_HOUR && hour < SEND_UNTIL_HOUR
}

/** The next 09:00 in Boa Vista strictly after `now` (same day before 09:00, else the next day). */
export function nextSendingWindowStart(now: Date): Date {
  const local = new Date(now.getTime() - BOA_VISTA_OFFSET_MS)
  const startLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), SEND_FROM_HOUR)
  const start = startLocal + BOA_VISTA_OFFSET_MS
  return new Date(start > now.getTime() ? start : start + 24 * 60 * MIN)
}

export type StaleReason = 'deadline_passed' | 'stale' | 'after_event'

/**
 * Why a due message no longer makes sense at `now` (null = send it): nothing after the party
 * starts; no D-7 once the D-1 time has come; no rsvp nudge/final notice after the deadline (the
 * final notice is never due before RSVP_FINAL_TIME, so this also keeps it from announcing a
 * deadline already gone when the deadline was moved earlier).
 */
export function staleReason(kind: ReminderKind, settings: Pick<Settings, 'rsvpDeadline'>, now: Date): StaleReason | null {
  if (now.getTime() >= EVENT_STARTS_AT.getTime()) return 'after_event'
  if (kind === 'reminder_d7' && now.getTime() >= REMINDER_TIMES.reminder_d1.getTime()) return 'stale'
  if ((kind === 'rsvp_nudge' || kind === 'rsvp_final') && isDeadlinePassed(settings.rsvpDeadline, now)) {
    return 'deadline_passed'
  }
  return null
}

/** Seed for varyGreeting: differs per guest and per attempt, so a retry is not byte-identical. */
export function greetingSeed(guestId: string, attempts: number): number {
  let h = 0
  for (let i = 0; i < guestId.length; i++) h = (h * 31 + guestId.charCodeAt(i)) >>> 0
  return (h % 1000) + attempts
}

function retryDelayMs(attempts: number): number {
  return attempts === 1 ? 5 * MIN : 15 * MIN
}

// Last non-open state logged, so `dispatcher_paused` is logged once per state change.
let pausedState: string | null = null

function logPaused(state: string): void {
  if (pausedState === state) return
  pausedState = state
  logger.warn({ event: 'whatsapp.dispatcher_paused', state }, 'reminder dispatcher paused')
}

type Outcome = 'sent' | 'retry' | 'failed' | 'not_connected'

function isEligible(guest: Guest | null, kind: ReminderKind): guest is Guest & { phone: string } {
  return !!guest && guest.rsvpStatus === KIND_RULES[kind].rsvpStatus && !!guest.phone
}

/**
 * One pass: recover stuck rows → config → sending hours (09:00–20:00 Boa Vista; outside them due
 * rows move to the next 09:00 and nothing is sent) → connection open → then, one row at a time:
 * pause 20–60 s if the previous iteration sent → hours check again → claim → eligibility and
 * time-context check → send at once (at most 30 sends). A disconnect mid-tick stops it.
 */
export async function runDispatcherTick(deps: DispatcherDeps): Promise<DispatcherTickResult> {
  const result: DispatcherTickResult = { sent: 0, failed: 0, skipped: null }
  // first, so interrupted invites/reminders recover even while unconfigured or disconnected
  await recoverStuckSending()

  const cfg = deps.readEvolutionConfig()
  if (!cfg) return { ...result, skipped: 'not_configured' }

  if (await deferIfQuietHours(deps.now())) return { ...result, skipped: 'quiet_hours' }

  const state = await deps.getConnectionState(cfg)
  const stateName = state.ok ? state.value : state.error
  if (stateName !== 'open') {
    logPaused(stateName)
    return { ...result, skipped: 'not_connected' }
  }
  pausedState = null

  let sends = 0
  let sentLast = false
  while (sends < MAX_SENDS_PER_TICK) {
    if (sentLast) await deps.sleep(20_000 + deps.random() * 40_000)
    sentLast = false

    if (await deferIfQuietHours(deps.now())) return { ...result, skipped: 'quiet_hours' }

    const row = await claimDueReminder()
    if (!row) break
    const kind = row.kind as ReminderKind
    const ids = { dispatchId: row.id, guestId: row.guestId, kind }

    if (row.attempts > MAX_ATTEMPTS) {
      // recovered after an interrupted last attempt: the budget is spent (the claim counted one more)
      await markDispatchFailed(row.id, 'interrupted', MAX_ATTEMPTS)
      result.failed++
      logger.warn({ event: 'whatsapp.reminder_failed', ...ids, errorCode: 'interrupted' }, 'reminder failed')
      continue
    }

    // checked right before sending: the guest may have answered during the pause
    const guest = await findGuestById(row.guestId)
    if (!isEligible(guest, kind)) {
      await markDispatchCancelled(row.id)
      logger.info({ event: 'whatsapp.reminder_cancelled', ...ids }, 'reminder cancelled')
      continue
    }

    let settings: Settings
    try {
      settings = await getSettings()
    } catch (err) {
      logger.error({ event: 'whatsapp.dispatcher_error', ...ids, err }, 'reminder settings load failed')
      await retryOrFail(deps, row, ids, 'internal_error')
      result.failed++
      continue
    }

    const stale = staleReason(kind, settings, deps.now())
    if (stale) {
      await markDispatchCancelled(row.id, stale)
      logger.info({ event: 'whatsapp.reminder_cancelled', ...ids, errorCode: stale }, 'reminder cancelled')
      continue
    }

    sends++
    sentLast = true
    const outcome = await sendOne(deps, cfg, row, kind, guest, settings)
    if (outcome === 'sent') result.sent++
    else if (outcome === 'not_connected') {
      logPaused('not_connected')
      return { ...result, skipped: 'not_connected' }
    } else result.failed++
  }
  return result
}

/** Outside 09:00–20:00 Boa Vista: due reminders wait for the next 09:00 (no attempt consumed). */
async function deferIfQuietHours(now: Date): Promise<boolean> {
  if (isWithinSendingHours(now)) return false
  const at = nextSendingWindowStart(now)
  const moved = await deferDueReminders(at)
  if (moved > 0) logger.info({ event: 'whatsapp.reminders_deferred', count: moved, until: at.toISOString() }, 'reminders deferred to sending hours')
  return true
}

async function sendOne(
  deps: DispatcherDeps,
  cfg: NonNullable<ReturnType<DispatcherDeps['readEvolutionConfig']>>,
  row: MessageDispatch,
  kind: ReminderKind,
  guest: Guest & { phone: string },
  settings: Settings,
): Promise<Outcome> {
  const ids = { dispatchId: row.id, guestId: row.guestId, kind }
  let res: Awaited<ReturnType<DispatcherDeps['sendText']>>
  try {
    const rendered = renderTemplate(
      KIND_RULES[kind].text(settings),
      reminderTemplateValues(settings, guest, deps.now()),
    )
    const text = varyGreeting(rendered, greetingSeed(guest.id, row.attempts))
    res = await deps.sendText(cfg, { phoneE164: guest.phone, text })
  } catch (err) {
    // nothing reached the provider: goes through the normal retry budget
    logger.error({ event: 'whatsapp.dispatcher_error', ...ids, err }, 'reminder send crashed')
    return retryOrFail(deps, row, ids, 'internal_error')
  }

  if (res.ok) {
    try {
      await markDispatchSent(row.id, res.value.messageId)
    } catch (err) {
      // the message went out: never reschedule it here (that would send it twice); the row stays
      // `sending` and the tick stops
      logger.error({ event: 'whatsapp.dispatcher_error', ...ids, errorCode: 'record_failed', err }, 'reminder sent but not recorded')
      throw err
    }
    logger.info({ event: 'whatsapp.reminder_sent', ...ids }, 'reminder sent')
    return 'sent'
  }
  if (res.error === 'not_connected') {
    await deferReminder(row.id, new Date(deps.now().getTime() + NOT_CONNECTED_DELAY_MS), 'not_connected')
    logger.warn({ event: 'whatsapp.reminder_failed', ...ids, errorCode: 'not_connected' }, 'reminder deferred')
    return 'not_connected'
  }
  if (res.error === 'timeout') {
    // the provider may have delivered it: never retried automatically (the admin can re-arm it)
    await markDispatchFailed(row.id, 'timeout')
    logger.warn({ event: 'whatsapp.reminder_failed', ...ids, errorCode: 'timeout', attempts: row.attempts }, 'reminder failed')
    return 'failed'
  }
  return retryOrFail(deps, row, ids, res.error)
}

async function retryOrFail(
  deps: DispatcherDeps,
  row: MessageDispatch,
  ids: { dispatchId: string; guestId: string; kind: ReminderKind },
  errorCode: string,
): Promise<Outcome> {
  if (row.attempts < MAX_ATTEMPTS) {
    await rescheduleReminder(row.id, new Date(deps.now().getTime() + retryDelayMs(row.attempts)), errorCode)
    logger.warn({ event: 'whatsapp.reminder_failed', ...ids, errorCode, attempts: row.attempts }, 'reminder will retry')
    return 'retry'
  }
  await markDispatchFailed(row.id, errorCode)
  logger.warn({ event: 'whatsapp.reminder_failed', ...ids, errorCode, attempts: row.attempts }, 'reminder failed')
  return 'failed'
}

const defaultDeps: DispatcherDeps = {
  now: () => new Date(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  random: Math.random,
  sendText,
  getConnectionState,
  readEvolutionConfig,
}

const globalForDispatcher = globalThis as typeof globalThis & {
  __reminderDispatcherTimer?: ReturnType<typeof setInterval>
}

/**
 * Starts the once-a-minute dispatcher (idempotent per process). A tick with sends takes minutes
 * (20–60 s spacing): overlapping intervals are skipped by the `running` guard. Never throws.
 */
export function startDispatcher(deps: DispatcherDeps = defaultDeps): void {
  if (globalForDispatcher.__reminderDispatcherTimer) return

  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try {
      await runDispatcherTick(deps)
    } catch (err) {
      logger.error({ event: 'whatsapp.dispatcher_error', err }, 'reminder dispatcher tick failed')
    } finally {
      running = false
    }
  }
  const timer = setInterval(() => void tick(), TICK_INTERVAL_MS)
  timer.unref?.()
  globalForDispatcher.__reminderDispatcherTimer = timer
  logger.info({ event: 'whatsapp.dispatcher_started' }, 'reminder dispatcher started')
}

/** Tests only: stops the interval and forgets the paused state. */
export function resetDispatcherForTests(): void {
  clearInterval(globalForDispatcher.__reminderDispatcherTimer)
  globalForDispatcher.__reminderDispatcherTimer = undefined
  pausedState = null
}
