// Pure helpers for the admin Pix overview (no React, client-safe, unit-tested).
import type { PixStatus } from '@/server/db/schema'

/** What the admin sees: the stored status, plus "refunded" (paid, then refunded) and a lapsed QR as expired. */
export type PixAdminStatus = 'pending' | 'paid' | 'refunded' | 'expired' | 'cancelled' | 'failed'

type StatusInput = { status: PixStatus; expiresAt: Date | null; refundedAt: Date | null }

export function pixAdminStatus(p: StatusInput, now: Date): PixAdminStatus {
  if (p.status === 'paid') return p.refundedAt ? 'refunded' : 'paid'
  // the QR stopped being payable even if Asaas' OVERDUE has not arrived yet
  if (p.status === 'pending') return p.expiresAt && p.expiresAt <= now ? 'expired' : 'pending'
  return p.status
}

export type PixTotals = { receivedCents: number; receivedCount: number; pendingCents: number; pendingCount: number }

/** Received = paid and not refunded; pending = still payable QRs. */
export function pixTotals(list: (StatusInput & { amountCents: number })[], now: Date): PixTotals {
  const totals: PixTotals = { receivedCents: 0, receivedCount: 0, pendingCents: 0, pendingCount: 0 }
  for (const p of list) {
    const status = pixAdminStatus(p, now)
    if (status === 'paid') {
      totals.receivedCents += p.amountCents
      totals.receivedCount += 1
    } else if (status === 'pending') {
      totals.pendingCents += p.amountCents
      totals.pendingCount += 1
    }
  }
  return totals
}
