import { and, eq, gt } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { guests, pixPayments, settings, type PixPayment, type PixStatus } from '@/server/db/schema'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A `pending`, not yet expired charge of this guest for exactly this amount (reused instead of a new one). */
export async function findReusablePending(
  guestId: string,
  amountCents: number,
  now: Date,
): Promise<PixPayment | null> {
  const [row] = await db
    .select()
    .from(pixPayments)
    .where(
      and(
        eq(pixPayments.guestId, guestId),
        eq(pixPayments.amountCents, amountCents),
        eq(pixPayments.status, 'pending'),
        gt(pixPayments.expiresAt, now),
      ),
    )
    .orderBy(pixPayments.createdAt)
    .limit(1)
  return row ?? null
}

export async function insertPendingPayment(input: {
  id: string
  guestId: string
  amountCents: number
  asaasPaymentId: string
  qrImage: string
  copyPaste: string
  expiresAt: Date | null
  now: Date
}): Promise<PixPayment> {
  const { now, ...values } = input
  const [row] = await db
    .insert(pixPayments)
    .values({ ...values, status: 'pending', createdAt: now, updatedAt: now })
    .returning()
  return row
}

export async function findGuestPayment(guestId: string, paymentId: string): Promise<PixPayment | null> {
  if (!UUID.test(paymentId)) return null
  const [row] = await db
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
): Promise<PixPayment | null> {
  const [row] = await db
    .update(pixPayments)
    .set({ status, updatedAt: now, ...(status === 'paid' ? { paidAt: now } : {}) })
    .where(and(eq(pixPayments.id, id), eq(pixPayments.status, 'pending')))
    .returning()
  return row ?? null
}

export async function getGenericCustomerId(): Promise<string | null> {
  await db.insert(settings).values({ id: 1 }).onConflictDoNothing()
  const [row] = await db
    .select({ id: settings.asaasCustomerId })
    .from(settings)
    .where(eq(settings.id, 1))
  return row?.id ?? null
}

export async function saveGenericCustomerId(customerId: string): Promise<void> {
  await db.update(settings).set({ asaasCustomerId: customerId }).where(eq(settings.id, 1))
}

export async function getGuestCustomerId(guestId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: guests.asaasCustomerId })
    .from(guests)
    .where(eq(guests.id, guestId))
  return row?.id ?? null
}

export async function saveGuestCustomerId(guestId: string, customerId: string): Promise<void> {
  await db.update(guests).set({ asaasCustomerId: customerId }).where(eq(guests.id, guestId))
}
