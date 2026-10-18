'use client'

import { QrCode } from 'lucide-react'
import { useMemo } from 'react'
import type { PixAdminStatus } from '@/features/pix/admin-view'
import { formatCents } from '@/features/pix/format'
import { createDataTableColumnHelper, DataTable, type DataTableFilter } from './data-table/DataTable'
import { compareText, formatBoaVistaDateTime } from './data-table/helpers'
import { Badge, type BadgeTone } from './ui/Badge'

/** Only what the table shows (already authorized on the server; no QR, no copy-paste code). */
export type PixRow = {
  id: string
  guestName: string
  amountCents: number
  status: PixAdminStatus
  /** ISO */
  createdAt: string
  /** ISO, null until paid */
  paidAt: string | null
}

const STATUS: Record<PixAdminStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: 'Aguardando', tone: 'gold' },
  paid: { label: 'Pago', tone: 'sage' },
  refunded: { label: 'Estornado', tone: 'rose' },
  expired: { label: 'Expirado', tone: 'neutral' },
  cancelled: { label: 'Cancelado', tone: 'neutral' },
  failed: { label: 'Falhou', tone: 'error' },
}

const ORDER: PixAdminStatus[] = ['paid', 'pending', 'refunded', 'expired', 'cancelled', 'failed']

const STATUS_FILTER: DataTableFilter = {
  columnId: 'status',
  label: 'Situação',
  options: ORDER.map((value) => ({ value, label: STATUS[value].label })),
}

const helper = createDataTableColumnHelper<PixRow>()

export function PixStatusBadge({ status }: { status: PixAdminStatus }) {
  return <Badge tone={STATUS[status].tone}>{STATUS[status].label}</Badge>
}

/** Read-only list of Pix payments (dynamic mode: Asaas settles them; nothing is marked by hand). */
export function PixTable({ payments }: { payments: PixRow[] }) {
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
        helper.accessor('amountCents', {
          header: 'Valor',
          enableSorting: true,
          sortFn: (a, b) => a.original.amountCents - b.original.amountCents,
          meta: { className: 'whitespace-nowrap tabular-nums' },
          cell: (info) => formatCents(info.getValue()),
        }),
        helper.accessor('status', {
          header: 'Situação',
          cell: (info) => <PixStatusBadge status={info.getValue()} />,
        }),
        helper.accessor('createdAt', {
          header: 'Criado em',
          enableSorting: true,
          sortFn: (a, b) => a.original.createdAt.localeCompare(b.original.createdAt),
          meta: { className: 'whitespace-nowrap tabular-nums' },
          cell: (info) => formatBoaVistaDateTime(info.getValue()),
        }),
        helper.accessor('paidAt', {
          header: 'Pago em',
          enableSorting: true,
          sortFn: (a, b) => (a.original.paidAt ?? '').localeCompare(b.original.paidAt ?? ''),
          meta: { className: 'whitespace-nowrap tabular-nums' },
          cell: (info) =>
            info.getValue() ? formatBoaVistaDateTime(info.getValue()) : <span className="text-muted">—</span>,
        }),
      ]),
    [],
  )

  const emptyState = (
    <div className="flex flex-col items-center gap-5 border border-dashed border-hairline-strong bg-paper px-6 py-16 text-center">
      <span aria-hidden="true" className="grid size-14 place-items-center rounded-full bg-blush text-seal">
        <QrCode className="size-6" strokeWidth={1.5} />
      </span>
      <div className="flex flex-col gap-1.5">
        <p className="text-lg font-medium">Nenhum Pix ainda</p>
        <p className="max-w-[44ch] text-[15px] text-muted">
          Quando um convidado gerar um Pix pelo convite, ele aparece aqui, e fica pago assim que o banco confirmar.
        </p>
      </div>
    </div>
  )

  return (
    <DataTable
      data={payments}
      columns={columns}
      getRowId={(p) => p.id}
      // no initial sort: the server order (newest first)
      regionLabel="Tabela de Pix"
      searchLabel="Buscar convidado"
      searchPlaceholder="Buscar por convidado"
      searchPlaceholderPhone="Buscar convidado"
      filters={[STATUS_FILTER]}
      emptyState={emptyState}
      emptyMessage="Nenhum Pix encontrado com essa busca."
    />
  )
}
