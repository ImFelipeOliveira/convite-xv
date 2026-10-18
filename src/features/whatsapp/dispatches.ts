import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/server/db/client'
import {
  guests,
  messageDispatches,
  type DispatchKind,
  type DispatchStatus,
  type MessageDispatch,
} from '@/server/db/schema'

/** Every automatic (scheduled, one-per-guest) kind: confirmed-guest reminders and rsvp nudges. */
export type ReminderKind = Exclude<DispatchKind, 'invite'>

/**
 * Registers an invite send. The guest row lock serializes concurrent calls; blocked while a
 * `sending` invite exists or a `sent` one in the last 60 s.
 */
export async function createInviteDispatch(
  guestId: string,
  adminId: string | null,
): Promise<{ id: string } | { blocked: true }> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM guests WHERE id = ${guestId} FOR UPDATE`)
    const recent = await tx.execute(sql`
      SELECT id FROM message_dispatches
      WHERE guest_id = ${guestId} AND kind = 'invite'
        AND (status = 'sending' OR (status = 'sent' AND sent_at > now() - interval '60 seconds'))
      LIMIT 1`)
    if (recent.length > 0) return { blocked: true as const }
    const [row] = await tx
      .insert(messageDispatches)
      .values({ guestId, adminId, kind: 'invite', status: 'sending', attempts: 1 })
      .returning({ id: messageDispatches.id })
    return { id: row.id }
  })
}

/** Current time by the database clock (the one the dispatch windows use). */
export async function dbNow(): Promise<Date> {
  const rows = await db.execute<{ now: Date | string }>(sql`SELECT now() AS now`)
  return new Date(rows[0].now)
}

/** Marks a dispatch sent (DB clock) and returns the recorded `sentAt`. */
export async function markDispatchSent(id: string, providerMessageId: string | null): Promise<Date> {
  const [row] = await db
    .update(messageDispatches)
    .set({
      status: 'sent',
      providerMessageId,
      errorCode: null,
      sentAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(eq(messageDispatches.id, id))
    .returning({ sentAt: messageDispatches.sentAt })
  return row?.sentAt ?? new Date()
}

/** Marks a dispatch failed; `attempts`, when given, corrects the counter (e.g. back to the cap). */
export async function markDispatchFailed(id: string, errorCode: string, attempts?: number): Promise<void> {
  await db
    .update(messageDispatches)
    .set({ status: 'failed', errorCode, updatedAt: sql`now()`, ...(attempts === undefined ? {} : { attempts }) })
    .where(eq(messageDispatches.id, id))
}

/** Latest invite row per guest. */
export async function lastInvitePerGuest(): Promise<
  Map<string, { status: DispatchStatus; at: Date }>
> {
  const rows = await db.execute<{
    guest_id: string
    status: DispatchStatus
    sent_at: Date | null
    created_at: Date
  }>(sql`
    SELECT DISTINCT ON (guest_id) guest_id, status, sent_at, created_at
    FROM message_dispatches
    WHERE kind = 'invite'
    ORDER BY guest_id, created_at DESC`)
  return new Map(
    rows.map((r) => [
      r.guest_id,
      { status: r.status, at: new Date(r.sent_at ?? r.created_at) },
    ]),
  )
}

export async function listDispatches(
  filter: { kind?: DispatchKind; status?: DispatchStatus } = {},
): Promise<Array<MessageDispatch & { guestName: string }>> {
  const conds = [
    filter.kind ? eq(messageDispatches.kind, filter.kind) : undefined,
    filter.status ? eq(messageDispatches.status, filter.status) : undefined,
  ].filter((c) => c !== undefined)
  const rows = await db
    .select({ dispatch: messageDispatches, guestName: guests.name })
    .from(messageDispatches)
    .innerJoin(guests, eq(guests.id, messageDispatches.guestId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(messageDispatches.createdAt))
    .limit(500)
  return rows.map((r) => ({ ...r.dispatch, guestName: r.guestName }))
}

/** Creates or re-arms a reminder; a `sent`/`sending`/`failed` row is never touched. */
export async function upsertReminder(
  guestId: string,
  kind: ReminderKind,
  scheduledFor: Date,
): Promise<void> {
  await db
    .insert(messageDispatches)
    .values({ guestId, kind, status: 'scheduled', scheduledFor })
    .onConflictDoUpdate({
      target: [messageDispatches.guestId, messageDispatches.kind],
      targetWhere: sql`${messageDispatches.kind} <> 'invite'`,
      set: { status: 'scheduled', scheduledFor, attempts: 0, errorCode: null, updatedAt: sql`now()` },
      setWhere: sql`${messageDispatches.status} in ('cancelled', 'scheduled')`,
    })
}

/** Cancels the guest's `scheduled` rows of the given kinds (sent/sending/failed rows are kept). */
export async function cancelDispatches(guestId: string, kinds: readonly ReminderKind[]): Promise<void> {
  if (kinds.length === 0) return
  await db
    .update(messageDispatches)
    .set({ status: 'cancelled', updatedAt: sql`now()` })
    .where(
      and(
        eq(messageDispatches.guestId, guestId),
        eq(messageDispatches.status, 'scheduled'),
        inArray(messageDispatches.kind, [...kinds]),
      ),
    )
}

export async function claimDueReminder(now: Date): Promise<MessageDispatch | null> {
  const rows = await db.execute(sql`
    UPDATE message_dispatches
    SET status = 'sending', attempts = attempts + 1, updated_at = now()
    WHERE id = (
      SELECT id FROM message_dispatches
      WHERE status = 'scheduled' AND kind <> 'invite' AND scheduled_for <= ${now.toISOString()}
      ORDER BY scheduled_for
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id`)
  if (rows.length === 0) return null
  const [row] = await db
    .select()
    .from(messageDispatches)
    .where(eq(messageDispatches.id, rows[0].id as string))
  return row ?? null
}

/**
 * Re-arms a failed reminder for the dispatcher's next pass (now, fresh retry budget).
 * Invites and reminders in any other status are never touched. Returns whether a row changed.
 */
export async function retryFailedReminder(id: string): Promise<boolean> {
  const rows = await db
    .update(messageDispatches)
    .set({ status: 'scheduled', scheduledFor: sql`now()`, attempts: 0, errorCode: null, updatedAt: sql`now()` })
    .where(
      and(
        eq(messageDispatches.id, id),
        eq(messageDispatches.status, 'failed'),
        sql`${messageDispatches.kind} <> 'invite'`,
      ),
    )
    .returning({ id: messageDispatches.id })
  return rows.length > 0
}

export async function rescheduleReminder(id: string, at: Date, errorCode: string): Promise<void> {
  await db
    .update(messageDispatches)
    .set({ status: 'scheduled', scheduledFor: at, errorCode, updatedAt: sql`now()` })
    .where(eq(messageDispatches.id, id))
}

/** `sending` rows untouched for 10 min: reminders go back to `scheduled`, invites fail. */
export async function recoverStuckSending(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - 10 * 60 * 1000).toISOString()
  const rows = await db.execute(sql`
    UPDATE message_dispatches
    SET status = CASE WHEN kind = 'invite' THEN 'failed'::dispatch_status ELSE 'scheduled'::dispatch_status END,
        error_code = CASE WHEN kind = 'invite' THEN 'interrupted' ELSE error_code END,
        updated_at = now()
    WHERE status = 'sending' AND updated_at < ${cutoff}
    RETURNING id`)
  return rows.length
}

/** Cancels a claimed reminder (the guest is no longer eligible for it). */
export async function markDispatchCancelled(id: string): Promise<void> {
  await db
    .update(messageDispatches)
    .set({ status: 'cancelled', updatedAt: sql`now()` })
    .where(eq(messageDispatches.id, id))
}

/**
 * Puts a claimed reminder back for later without consuming the attempt the claim counted
 * (e.g. the WhatsApp instance disconnected: the message was never handed to the provider).
 */
export async function deferReminder(id: string, at: Date, errorCode: string): Promise<void> {
  await db
    .update(messageDispatches)
    .set({
      status: 'scheduled',
      scheduledFor: at,
      errorCode,
      attempts: sql`greatest(${messageDispatches.attempts} - 1, 0)`,
      updatedAt: sql`now()`,
    })
    .where(eq(messageDispatches.id, id))
}
