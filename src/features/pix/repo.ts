import { and, desc, eq, gt, isNotNull, isNull, ne, or, sql } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { guests, pixPayments, settings, webhookEvents, type PixPayment, type PixStatus } from '@/server/db/schema'

/** The shared client or an open transaction (queries made under a lock run on its connection). */
export type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Once the advisory lock is held, no other lock wait (rows, nested advisory locks) may hang longer. */
const LOCK_TIMEOUT = '20s'

/** A reused QR must stay payable for at least this long. */
const REUSE_MARGIN_MS = 15 * 60_000

/**
 * Runs `fn(tx)` holding a transaction-scoped Postgres advisory lock on `key`, serializing
 * check-then-create flows across requests. `fn` must run its queries on `tx` (one pooled connection
 * per flow, so concurrent flows can never starve the pool); the lock ends with the transaction.
 * Inside it, other lock waits give up after 20 s (`lock_timeout`, scoped to the transaction).
 */
export async function withAdvisoryLock<T>(
  key: string,
  fn: (tx: Executor) => Promise<T>,
  q: Executor = db,
): Promise<T> {
  return q.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`)
    await tx.execute(sql.raw(`set local lock_timeout = '${LOCK_TIMEOUT}'`))
    return fn(tx)
  })
}

/**
 * A `pending` charge of this guest for exactly this amount that stays payable for at least 15 more
 * minutes (reused instead of a new one). Unknown expiry → never reused.
 */
export async function findReusablePending(
  guestId: string,
  amountCents: number,
  now: Date,
  q: Executor = db,
): Promise<PixPayment | null> {
  const [row] = await q
    .select()
    .from(pixPayments)
    .where(
      and(
        eq(pixPayments.guestId, guestId),
        eq(pixPayments.amountCents, amountCents),
        eq(pixPayments.status, 'pending'),
        gt(pixPayments.expiresAt, new Date(now.getTime() + REUSE_MARGIN_MS)),
      ),
    )
    .orderBy(pixPayments.createdAt)
    .limit(1)
  return row ?? null
}

/** Inserts inside a savepoint, so a failure leaves the caller's transaction usable. */
export async function insertPendingPayment(
  input: {
    id: string
    guestId: string
    amountCents: number
    asaasPaymentId: string
    qrImage: string
    copyPaste: string
    expiresAt: Date | null
    now: Date
  },
  q: Executor = db,
): Promise<PixPayment> {
  const { now, ...values } = input
  return q.transaction(async (sp) => {
    const [row] = await sp
      .insert(pixPayments)
      .values({ ...values, status: 'pending', createdAt: now, updatedAt: now })
      .returning()
    return row
  })
}

export async function findGuestPayment(
  guestId: string,
  paymentId: string,
  q: Executor = db,
): Promise<PixPayment | null> {
  if (!UUID.test(paymentId)) return null
  const [row] = await q
    .select()
    .from(pixPayments)
    .where(and(eq(pixPayments.id, paymentId), eq(pixPayments.guestId, guestId)))
  return row ?? null
}

/** Moves a still-`pending` payment to `status` (never overwrites a final status). */
export async function settlePendingPayment(
  id: string,
  status: PixStatus,
  now: Date,
  q: Executor = db,
): Promise<PixPayment | null> {
  const [row] = await q
    .update(pixPayments)
    .set({ status, updatedAt: now, ...(status === 'paid' ? { paidAt: now } : {}) })
    .where(and(eq(pixPayments.id, id), eq(pixPayments.status, 'pending')))
    .returning()
  return row ?? null
}

export async function getGenericCustomerId(q: Executor = db): Promise<string | null> {
  await q.insert(settings).values({ id: 1 }).onConflictDoNothing()
  const [row] = await q
    .select({ id: settings.asaasCustomerId })
    .from(settings)
    .where(eq(settings.id, 1))
  return row?.id ?? null
}

/** Stores the generic customer id only if none is stored yet. */
export async function saveGenericCustomerId(customerId: string, q: Executor = db): Promise<void> {
  await q
    .update(settings)
    .set({ asaasCustomerId: customerId })
    .where(and(eq(settings.id, 1), isNull(settings.asaasCustomerId)))
}

export async function getGuestCustomerId(guestId: string, q: Executor = db): Promise<string | null> {
  const [row] = await q
    .select({ id: guests.asaasCustomerId })
    .from(guests)
    .where(eq(guests.id, guestId))
  return row?.id ?? null
}

export async function saveGuestCustomerId(
  guestId: string,
  customerId: string,
  q: Executor = db,
): Promise<void> {
  await q.update(guests).set({ asaasCustomerId: customerId }).where(eq(guests.id, guestId))
}

/**
 * What the invite shows on load: the guest's newest charge that is either paid or still payable
 * (pending, expiring after `now`), plus the amount of their newest paid charge.
 */
export async function findGuestPixState(
  guestId: string,
  now: Date,
  q: Executor = db,
): Promise<{ current: PixPayment | null; paid: PixPayment | null }> {
  const [current] = await q
    .select()
    .from(pixPayments)
    .where(
      and(
        eq(pixPayments.guestId, guestId),
        or(
          eq(pixPayments.status, 'paid'),
          and(eq(pixPayments.status, 'pending'), gt(pixPayments.expiresAt, now)),
        ),
      ),
    )
    .orderBy(desc(pixPayments.createdAt))
    .limit(1)
  const [paid] = await q
    .select()
    .from(pixPayments)
    .where(and(eq(pixPayments.guestId, guestId), eq(pixPayments.status, 'paid')))
    .orderBy(desc(pixPayments.paidAt), desc(pixPayments.createdAt))
    .limit(1)
  return { current: current ?? null, paid: paid ?? null }
}

/**
 * Records a webhook event (pk = Asaas event id). False when it was already processed (a redelivery); an
 * event recorded but never processed (`processed_at` null, e.g. an unknown payment) is taken again.
 * Inside the caller's transaction, a concurrent delivery of the same event waits for it to commit.
 */
export async function insertWebhookEvent(
  input: { id: string; type: string; paymentId: string | null; now: Date },
  q: Executor = db,
): Promise<boolean> {
  const rows = await q
    .insert(webhookEvents)
    .values({ id: input.id, type: input.type, paymentId: input.paymentId, receivedAt: input.now })
    .onConflictDoUpdate({
      target: webhookEvents.id,
      set: { receivedAt: input.now },
      setWhere: isNull(webhookEvents.processedAt),
    })
    .returning({ id: webhookEvents.id })
  return rows.length > 0
}

/** True once the event was processed (a redelivery needs no work, nor a call to Asaas). */
export async function isWebhookEventProcessed(id: string, q: Executor = db): Promise<boolean> {
  const [row] = await q
    .select({ id: webhookEvents.id })
    .from(webhookEvents)
    .where(and(eq(webhookEvents.id, id), isNotNull(webhookEvents.processedAt)))
  return !!row
}

export async function markWebhookEventProcessed(id: string, now: Date, q: Executor = db): Promise<void> {
  await q.update(webhookEvents).set({ processedAt: now }).where(eq(webhookEvents.id, id))
}

/**
 * The payment a webhook refers to: by Asaas payment id, else by `externalReference` (our id) for a row
 * that has no Asaas id stored. `lock` = `SELECT … FOR UPDATE` (inside a transaction: concurrent events
 * for the same payment apply one after the other).
 */
export async function findPaymentForWebhook(
  asaasPaymentId: string,
  externalReference: string | null,
  q: Executor = db,
  { lock = false }: { lock?: boolean } = {},
): Promise<PixPayment | null> {
  const byAsaasQuery = q.select().from(pixPayments).where(eq(pixPayments.asaasPaymentId, asaasPaymentId))
  const [byAsaas] = lock ? await byAsaasQuery.for('update') : await byAsaasQuery
  if (byAsaas) return byAsaas
  if (!externalReference || !UUID.test(externalReference)) return null
  const byRefQuery = q
    .select()
    .from(pixPayments)
    .where(and(eq(pixPayments.id, externalReference), isNull(pixPayments.asaasPaymentId)))
  const [byRef] = lock ? await byRefQuery.for('update') : await byRefQuery
  return byRef ?? null
}

/** Marks a payment `paid` (from any status but `paid`: the money arrived). Null when it already was. */
export async function markPaymentPaid(id: string, now: Date, q: Executor = db): Promise<PixPayment | null> {
  const [row] = await q
    .update(pixPayments)
    .set({ status: 'paid', paidAt: now, updatedAt: now })
    .where(and(eq(pixPayments.id, id), ne(pixPayments.status, 'paid')))
    .returning()
  return row ?? null
}

export type AdminPixPayment = Pick<
  PixPayment,
  'id' | 'amountCents' | 'status' | 'expiresAt' | 'paidAt' | 'refundedAt' | 'createdAt'
> & {
  /** null once the guest was deleted (the payment stays, guest_id set null) */
  guestName: string | null
}

/** Every payment for the admin overview, newest first (never the QR or the copy-paste code). */
export async function listPixPaymentsAdmin(q: Executor = db): Promise<AdminPixPayment[]> {
  return q
    .select({
      id: pixPayments.id,
      amountCents: pixPayments.amountCents,
      status: pixPayments.status,
      expiresAt: pixPayments.expiresAt,
      paidAt: pixPayments.paidAt,
      refundedAt: pixPayments.refundedAt,
      createdAt: pixPayments.createdAt,
      guestName: guests.name,
    })
    .from(pixPayments)
    .leftJoin(guests, eq(guests.id, pixPayments.guestId))
    .orderBy(desc(pixPayments.createdAt), desc(pixPayments.id))
}

/** Paid (and not refunded) Pix: how many and the total, for the admin summary. */
export async function countPaidPix(q: Executor = db): Promise<{ count: number; totalCents: number }> {
  const [row] = await q
    .select({
      count: sql<number>`count(*)::int`,
      totalCents: sql<number>`coalesce(sum(${pixPayments.amountCents}), 0)::int`,
    })
    .from(pixPayments)
    .where(and(eq(pixPayments.status, 'paid'), isNull(pixPayments.refundedAt)))
  return row
}

/** Records a refund that arrived after the payment was paid (first one only; the status stays `paid`). */
export async function markPaymentRefunded(id: string, now: Date, q: Executor = db): Promise<void> {
  await q
    .update(pixPayments)
    .set({ refundedAt: now, updatedAt: now })
    .where(and(eq(pixPayments.id, id), eq(pixPayments.status, 'paid'), isNull(pixPayments.refundedAt)))
}
