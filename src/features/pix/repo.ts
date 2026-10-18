import { and, eq, gt, isNull, sql } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { guests, pixPayments, settings, type PixPayment, type PixStatus } from '@/server/db/schema'

/** The shared client or an open transaction (queries made under a lock run on its connection). */
export type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A reused QR must stay payable for at least this long. */
const REUSE_MARGIN_MS = 15 * 60_000

/**
 * Runs `fn(tx)` holding a transaction-scoped Postgres advisory lock on `key`, serializing
 * check-then-create flows across requests. `fn` must run its queries on `tx` (one pooled connection
 * per flow, so concurrent flows can never starve the pool); the lock ends with the transaction.
 */
export async function withAdvisoryLock<T>(
  key: string,
  fn: (tx: Executor) => Promise<T>,
  q: Executor = db,
): Promise<T> {
  return q.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`)
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
