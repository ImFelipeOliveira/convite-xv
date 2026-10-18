import type { Metadata } from 'next'
import { GiftsTable, type GiftRow } from '@/components/admin/GiftsTable'
import { requireAdmin } from '@/features/admin-auth/guard'
import { giftStatus } from '@/features/gifts/admin-view'
import { listGiftsAdmin } from '@/features/gifts/repo'

export const metadata: Metadata = { title: 'Presentes | Painel' }

export default async function GiftsPage() {
  await requireAdmin()
  const list = await listGiftsAdmin()
  // minimized rows: only what the table shows or its actions need (no guest ids/tokens)
  const rows: GiftRow[] = list.map((g) => ({
    id: g.id,
    name: g.name,
    category: g.category,
    priceCents: g.priceCents,
    purchaseUrl: g.purchaseUrl,
    imageUrl: g.imageUrl,
    sortOrder: g.sortOrder,
    status: giftStatus(g),
    reservedByName: g.guestId ? g.reservedByName : null,
  }))
  const reserved = rows.filter((g) => g.status !== 'free').length

  return (
    <div className="flex flex-col gap-8">
      <GiftsTable
        gifts={rows}
        description={
          rows.length === 0
            ? 'Sugestões de presente com links de compra. O convidado reserva o que vai dar.'
            : `${rows.length} ${rows.length === 1 ? 'presente' : 'presentes'}, ${reserved} ${reserved === 1 ? 'reservado' : 'reservados'}.`
        }
      />
    </div>
  )
}
