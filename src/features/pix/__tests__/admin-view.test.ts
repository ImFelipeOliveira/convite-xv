import { describe, expect, it } from 'vitest'
import { db } from '@/server/db/client'
import { guests, pixPayments } from '@/server/db/schema'
import { makeGuest } from '../../../../tests/helpers/db'
import { pixAdminStatus, pixTotals, type PixAdminStatus } from '../admin-view'
import { countPaidPix, listPixPaymentsAdmin } from '../repo'

const NOW = new Date('2026-10-18T15:00:00Z')
const LATER = new Date('2026-10-19T15:00:00Z')
const EARLIER = new Date('2026-10-17T15:00:00Z')

type Row = Parameters<typeof pixAdminStatus>[0]
const row = (over: Partial<Row>): Row => ({ status: 'pending', expiresAt: LATER, refundedAt: null, ...over })

describe('pixAdminStatus', () => {
  it('maps the stored status to what the admin sees', () => {
    const cases: [Partial<Row>, PixAdminStatus][] = [
      [{ status: 'paid' }, 'paid'],
      [{ status: 'paid', refundedAt: NOW }, 'refunded'],
      [{ status: 'pending' }, 'pending'],
      [{ status: 'pending', expiresAt: null }, 'pending'],
      // the QR stopped being payable even if Asaas' OVERDUE has not arrived yet
      [{ status: 'pending', expiresAt: EARLIER }, 'expired'],
      [{ status: 'expired' }, 'expired'],
      [{ status: 'cancelled' }, 'cancelled'],
      [{ status: 'failed' }, 'failed'],
    ]
    for (const [over, expected] of cases) expect(pixAdminStatus(row(over), NOW)).toBe(expected)
  })
})

describe('pixTotals', () => {
  it('sums received (paid, not refunded) and pending (still payable) separately', () => {
    const totals = pixTotals(
      [
        { ...row({ status: 'paid' }), amountCents: 15000 },
        { ...row({ status: 'paid' }), amountCents: 7000 },
        { ...row({ status: 'paid', refundedAt: NOW }), amountCents: 10000 },
        { ...row({ status: 'pending' }), amountCents: 20000 },
        { ...row({ status: 'pending', expiresAt: EARLIER }), amountCents: 9000 },
        { ...row({ status: 'cancelled' }), amountCents: 8000 },
      ],
      NOW,
    )
    expect(totals).toEqual({ receivedCents: 22000, receivedCount: 2, pendingCents: 20000, pendingCount: 1 })
  })

  it('is all zeros without payments', () => {
    expect(pixTotals([], NOW)).toEqual({ receivedCents: 0, receivedCount: 0, pendingCents: 0, pendingCount: 0 })
  })
})

describe('listPixPaymentsAdmin / countPaidPix', () => {
  it('lists every payment newest first with the guest name (null once the guest was deleted)', async () => {
    const ana = await makeGuest({ name: 'Ana Pix' })
    const bruno = await makeGuest({ name: 'Bruno Pix' })
    await db.insert(pixPayments).values([
      { guestId: ana.id, amountCents: 15000, status: 'paid', paidAt: NOW, createdAt: EARLIER },
      { guestId: bruno.id, amountCents: 7000, status: 'pending', expiresAt: LATER, createdAt: NOW },
      { guestId: ana.id, amountCents: 10000, status: 'paid', paidAt: NOW, refundedAt: LATER, createdAt: new Date(NOW.getTime() - 3_600_000) },
    ])
    const list = await listPixPaymentsAdmin()
    expect(list.map((p) => [p.guestName, p.amountCents])).toEqual([
      ['Bruno Pix', 7000],
      ['Ana Pix', 10000],
      ['Ana Pix', 15000],
    ])
    expect(list[1].refundedAt).toEqual(LATER)
    // never the QR or the copy-paste code
    expect(Object.keys(list[0])).not.toContain('copyPaste')
    expect(Object.keys(list[0])).not.toContain('qrImage')

    expect(await countPaidPix()).toEqual({ count: 1, totalCents: 15000 })

    await db.delete(guests)
    expect((await listPixPaymentsAdmin()).every((p) => p.guestName === null)).toBe(true)
  })
})
