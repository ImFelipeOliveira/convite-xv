'use client'

import { ArrowRight, History, RotateCw } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useTransition } from 'react'
import { retryDispatchAction } from '@/features/whatsapp/actions'
import { useSkewGuard } from './skew-recovery'
import {
  DISPATCH_KIND_LABEL,
  DISPATCH_STATUS_LABEL,
  dispatchErrorLabel,
} from '@/features/whatsapp/dispatch-labels'
import type { DispatchKind, DispatchStatus } from '@/server/db/schema'
import { createDataTableColumnHelper, DataTable, type DataTableFilter } from './data-table/DataTable'
import { compareText, formatBoaVistaDateTime } from './data-table/helpers'
import { buttonClass } from './styles'
import { Badge, type BadgeTone } from './ui/Badge'
import { Button } from './ui/Button'
import { useToast } from './ui/Toast'

/** Only what the history shows or its actions need (already authorized on the server). */
export type DispatchRow = {
  id: string
  guestName: string
  kind: DispatchKind
  status: DispatchStatus
  /** ISO: sent time when sent, scheduled time while scheduled, else the last update */
  when: string
  errorCode: string | null
}

const STATUS_TONE: Record<DispatchStatus, BadgeTone> = {
  scheduled: 'gold',
  sending: 'neutral',
  sent: 'sage',
  failed: 'error',
  cancelled: 'neutral',
}

const KIND_FILTER = 'kind'
const STATUS_FILTER = 'status'

const FILTERS: DataTableFilter[] = [
  {
    columnId: KIND_FILTER,
    label: 'Tipo',
    options: (Object.keys(DISPATCH_KIND_LABEL) as DispatchKind[]).map((value) => ({
      value,
      label: DISPATCH_KIND_LABEL[value],
    })),
  },
  {
    columnId: STATUS_FILTER,
    label: 'Situação',
    options: (Object.keys(DISPATCH_STATUS_LABEL) as DispatchStatus[]).map((value) => ({
      value,
      label: DISPATCH_STATUS_LABEL[value],
    })),
  },
]

const helper = createDataTableColumnHelper<DispatchRow>()

function RetryButton({ row }: { row: DispatchRow }) {
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const guard = useSkewGuard()
  return (
    <Button
      variant="secondary"
      size="sm"
      className="max-sm:min-h-11 max-sm:w-full"
      pending={pending}
      pendingLabel="Agendando…"
      icon={<RotateCw aria-hidden="true" className="size-4" strokeWidth={1.75} />}
      aria-label={`Tentar de novo — ${DISPATCH_KIND_LABEL[row.kind]} de ${row.guestName}`}
      onClick={() =>
        startTransition(async () => {
          const result = await guard(() => retryDispatchAction(row.id))
          if (!result) return
          if (result.ok) toast.success('Lembrete agendado de novo.')
          else toast.error('Este envio não pode ser repetido. Atualize a página.')
        })
      }
    >
      Tentar de novo
    </Button>
  )
}

function RowAction({ row }: { row: DispatchRow }) {
  if (row.status !== 'failed') return null
  if (row.kind === 'invite') {
    // invites are sent one by one from the guests list
    return (
      <Link href="/admin/guests" className={`${buttonClass('ghost', 'sm')} max-sm:min-h-11 max-sm:w-full`}>
        Reenviar em Convidados
        <ArrowRight aria-hidden="true" className="size-4" strokeWidth={1.75} />
      </Link>
    )
  }
  return <RetryButton row={row} />
}

/** Dispatch history of the WhatsApp page; the Tipo/Situação chips mirror `?kind=` / `?status=`. */
export function DispatchTable({
  rows,
  initialFilters,
}: {
  rows: DispatchRow[]
  initialFilters: Record<string, string>
}) {
  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor('guestName', {
          header: 'Convidado',
          enableSorting: true,
          sortFn: (a, b) => compareText(a.original.guestName, b.original.guestName),
          meta: { searchable: true, card: 'primary' },
          cell: (info) => <span className="font-medium text-wine max-sm:text-[17px]">{info.getValue()}</span>,
        }),
        helper.accessor('kind', {
          id: KIND_FILTER,
          header: 'Tipo',
          meta: { className: 'whitespace-nowrap' },
          cell: (info) => DISPATCH_KIND_LABEL[info.getValue()],
        }),
        helper.accessor('status', {
          id: STATUS_FILTER,
          header: 'Situação',
          cell: (info) => (
            <Badge tone={STATUS_TONE[info.getValue()]}>{DISPATCH_STATUS_LABEL[info.getValue()]}</Badge>
          ),
        }),
        helper.accessor('when', {
          header: 'Quando',
          enableSorting: true,
          meta: { className: 'whitespace-nowrap tabular-nums' },
          cell: (info) => formatBoaVistaDateTime(info.getValue()),
        }),
        helper.accessor('errorCode', {
          header: 'Erro',
          meta: { className: 'text-sm' },
          cell: (info) => dispatchErrorLabel(info.getValue()) ?? <span className="text-muted">—</span>,
        }),
        helper.display({
          id: 'actions',
          header: () => <span className="sr-only">Ações</span>,
          meta: { card: 'full', align: 'end', className: 'sm:w-px sm:whitespace-nowrap' },
          cell: ({ row }) => <RowAction row={row.original} />,
        }),
      ]),
    [],
  )

  const emptyState = (
    <div className="flex flex-col items-center gap-5 border border-dashed border-hairline-strong bg-paper px-6 py-14 text-center">
      <span aria-hidden="true" className="grid size-14 place-items-center rounded-full bg-blush text-seal">
        <History className="size-6" strokeWidth={1.5} />
      </span>
      <div className="flex flex-col gap-1.5">
        <p className="text-lg font-medium">Nenhum envio ainda</p>
        <p className="max-w-[46ch] text-[15px] text-muted">
          Os convites enviados pela lista de convidados aparecem aqui, junto com os lembretes de confirmação e
          os lembretes de 7 dias e da véspera.
        </p>
      </div>
      <Link href="/admin/guests" className={buttonClass('secondary')}>
        Ir para convidados
      </Link>
    </div>
  )

  return (
    <DataTable
      data={rows}
      columns={columns}
      getRowId={(r) => r.id}
      initialSorting={[{ id: 'when', desc: true }]}
      regionLabel="Tabela de envios"
      searchLabel="Buscar convidado"
      searchPlaceholder="Buscar convidado"
      filters={FILTERS}
      initialFilters={initialFilters}
      onFiltersChange={(filters) => {
        // keep the chips in the address bar (shareable, survives a reload) without a server round-trip
        const url = new URL(window.location.href)
        url.searchParams.delete(KIND_FILTER)
        url.searchParams.delete(STATUS_FILTER)
        for (const [key, value] of Object.entries(filters)) url.searchParams.set(key, value)
        window.history.replaceState(null, '', url)
      }}
      emptyState={emptyState}
      emptyMessage="Nenhum envio com esses filtros."
    />
  )
}
