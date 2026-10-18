// Sends the automatic WhatsApp messages (reminders D-7/D-1 and rsvp nudges) when due.
// Runs inside the Next.js server process (started from src/instrumentation.ts).
import { findGuestById } from '@/features/guests/repo'
import { getSettings } from '@/features/settings/repo'
import { logger } from '@/lib/logger'
import type { Guest, MessageDispatch, Settings } from '@/server/db/schema'
import { readEvolutionConfig } from './config'
import {
  claimDueReminder,
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
import { reminderTemplateValues } from './reminders'

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
  skipped: 'not_configured' | 'not_connected' | null
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
 * One pass: config → connection open → recover stuck rows → then, one row at a time:
 * pause 20–60 s if the previous iteration sent → claim → eligibility check → send at once
 * (at most 30 sends). A disconnect mid-tick stops it.
 */
export async function runDispatcherTick(deps: DispatcherDeps): Promise<DispatcherTickResult> {
  const result: DispatcherTickResult = { sent: 0, failed: 0, skipped: null }
  const cfg = deps.readEvolutionConfig()
  if (!cfg) return { ...result, skipped: 'not_configured' }

  const state = await deps.getConnectionState(cfg)
  const stateName = state.ok ? state.value : state.error
  if (stateName !== 'open') {
    logPaused(stateName)
    return { ...result, skipped: 'not_connected' }
  }
  pausedState = null

  await recoverStuckSending(deps.now())

  let sends = 0
  let sentLast = false
  while (sends < MAX_SENDS_PER_TICK) {
    if (sentLast) await deps.sleep(20_000 + deps.random() * 40_000)
    sentLast = false

    const row = await claimDueReminder(deps.now())
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

    sends++
    sentLast = true
    const outcome = await sendOne(deps, cfg, row, kind, guest)
    if (outcome === 'sent') result.sent++
    else if (outcome === 'not_connected') {
      logPaused('not_connected')
      return { ...result, skipped: 'not_connected' }
    } else result.failed++
  }
  return result
}

async function sendOne(
  deps: DispatcherDeps,
  cfg: NonNullable<ReturnType<DispatcherDeps['readEvolutionConfig']>>,
  row: MessageDispatch,
  kind: ReminderKind,
  guest: Guest & { phone: string },
): Promise<Outcome> {
  const ids = { dispatchId: row.id, guestId: row.guestId, kind }
  let res: Awaited<ReturnType<DispatcherDeps['sendText']>>
  try {
    const settings = await getSettings()
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
