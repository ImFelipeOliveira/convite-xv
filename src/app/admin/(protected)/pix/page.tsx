import { Clock, HandCoins } from 'lucide-react'
import type { Metadata } from 'next'
import { PixTable, type PixRow } from '@/components/admin/PixTable'
import { PageHeader } from '@/components/admin/ui/PageHeader'
import { StatCard } from '@/components/admin/ui/StatCard'
import { requireAdmin } from '@/features/admin-auth/guard'
import { pixAdminStatus, pixTotals } from '@/features/pix/admin-view'
import { formatCents } from '@/features/pix/format'
import { listPixPaymentsAdmin } from '@/features/pix/repo'

export const metadata: Metadata = { title: 'Pix | Painel' }

const icon = 'size-5'

export default async function PixPage() {
  await requireAdmin()
  const list = await listPixPaymentsAdmin()
  const now = new Date()
  const totals = pixTotals(list, now)
  // minimized rows: only what the table shows (no guest ids, QR or copy-paste code)
  const rows: PixRow[] = list.map((p) => ({
    id: p.id,
    guestName: p.guestName ?? 'Convidado removido',
    amountCents: p.amountCents,
    status: pixAdminStatus(p, now),
    createdAt: p.createdAt.toISOString(),
    paidAt: p.paidAt?.toISOString() ?? null,
  }))

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Pix"
        description="Presentes em Pix pelo convite. O pagamento é confirmado pelo Asaas; estornos não entram no total recebido."
      />
      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
        <StatCard
          emphasis
          icon={<HandCoins className={icon} strokeWidth={1.75} />}
          value={formatCents(totals.receivedCents)}
          label="Recebido"
          hint={`${totals.receivedCount} ${totals.receivedCount === 1 ? 'Pix pago' : 'Pix pagos'}`}
        />
        <StatCard
          icon={<Clock className={icon} strokeWidth={1.75} />}
          value={formatCents(totals.pendingCents)}
          label="Pendente"
          hint={`${totals.pendingCount} aguardando pagamento`}
        />
      </div>
      <PixTable payments={rows} />
    </div>
  )
}
