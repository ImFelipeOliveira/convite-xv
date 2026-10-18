import type { Metadata } from 'next'
import { Suspense } from 'react'
import { DispatchTable, type DispatchRow } from '@/components/admin/DispatchTable'
import { WhatsappStatus } from '@/components/admin/WhatsappStatus'
import { PageHeader } from '@/components/admin/ui/PageHeader'
import { Skeleton, TableSkeleton } from '@/components/admin/ui/Skeleton'
import { requireAdmin } from '@/features/admin-auth/guard'
import { readStatus } from '@/features/whatsapp/connection'
import { isDispatchKind, isDispatchStatus } from '@/features/whatsapp/dispatch-labels'
import { listDispatches } from '@/features/whatsapp/dispatches'

export const metadata: Metadata = { title: 'WhatsApp | Painel' }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

async function StatusSection() {
  await requireAdmin()
  return <WhatsappStatus initialState={await readStatus()} />
}

async function HistorySection({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin()
  const params = await searchParams
  const initialFilters: Record<string, string> = {}
  if (isDispatchKind(params.kind)) initialFilters.kind = params.kind
  if (isDispatchStatus(params.status)) initialFilters.status = params.status
  const list = await listDispatches()
  // minimized rows: only what the table shows or its actions need
  const rows: DispatchRow[] = list.map((d) => ({
    id: d.id,
    guestName: d.guestName,
    kind: d.kind,
    status: d.status,
    when: (
      (d.status === 'sent' ? d.sentAt : d.status === 'scheduled' ? d.scheduledFor : null) ?? d.updatedAt
    ).toISOString(),
    errorCode: d.status === 'failed' || d.status === 'scheduled' ? d.errorCode : null,
  }))
  return <DispatchTable rows={rows} initialFilters={initialFilters} />
}

function StatusSkeleton() {
  return (
    <div role="status" aria-label="Carregando" className="flex flex-col gap-5 border border-hairline bg-paper p-6">
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-full" />
        <Skeleton className="h-5 w-40" />
        <Skeleton className="ml-auto h-6 w-28 rounded-full" />
      </div>
      <Skeleton className="h-4 w-80 max-w-full" />
      <Skeleton className="h-11 w-48 rounded-full" />
    </div>
  )
}

export default async function WhatsappPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin()
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="WhatsApp"
        description="Conecte o número da família para enviar os convites e os lembretes automáticos."
      />
      {/* the status call may wait on Evolution: it streams on its own, the history doesn't wait for it */}
      <Suspense fallback={<StatusSkeleton />}>
        <StatusSection />
      </Suspense>
      <section aria-labelledby="dispatch-history-title" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="dispatch-history-title" className="font-display text-[26px] leading-tight text-wine">
            Histórico de envios
          </h2>
          <p className="text-[15px] text-muted">
            Convites enviados pelo painel e lembretes de 7 dias e da véspera.
          </p>
        </div>
        <Suspense fallback={<TableSkeleton />}>
          <HistorySection searchParams={searchParams} />
        </Suspense>
      </section>
    </div>
  )
}
