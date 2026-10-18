'use client'

import { ExternalLink, Gift, ImageOff, Pencil, Trash2, Undo2 } from 'lucide-react'
import { useMemo, useRef, useState, useTransition } from 'react'
import { deleteGiftAction, releaseGiftAction } from '@/features/gifts/admin-actions'
import { formatApproxPrice, priceInputValue, type AdminGiftStatus } from '@/features/gifts/admin-view'
import { createDataTableColumnHelper, DataTable, type DataTableFilter } from './data-table/DataTable'
import { compareText } from './data-table/helpers'
import { useImageFailed } from '@/lib/use-image-failed'
import { focusRing } from './styles'
import { GiftForm } from './GiftForm'
import { Badge } from './ui/Badge'
import { Button } from './ui/Button'
import { ConfirmDialog } from './ui/ConfirmDialog'
import { Sheet } from './ui/Modal'
import { PageHeader } from './ui/PageHeader'
import { useToast } from './ui/Toast'

/** Only what the table shows or its actions need (already authorized on the server). */
export type GiftRow = {
  id: string
  name: string
  category: string
  priceCents: number | null
  purchaseUrl: string | null
  imageUrl: string | null
  sortOrder: number
  status: AdminGiftStatus
  /** admin-visible by design; null when free */
  reservedByName: string | null
}

type SheetState = { kind: 'new' } | { kind: 'edit'; gift: GiftRow } | null

const helper = createDataTableColumnHelper<GiftRow>()

const STATUS_FILTER: DataTableFilter = {
  columnId: 'status',
  label: 'Situação',
  options: [
    { value: 'free', label: 'Livre' },
    { value: 'reserved', label: 'Reservado (confirmado)' },
    { value: 'declined', label: 'Reserva de quem recusou' },
  ],
}

const iconButton = `grid size-11 shrink-0 place-items-center rounded-full text-wine transition-[background-color,color,transform] duration-(--dur-micro) ease-(--ease-letter) hover:bg-blush hover:text-seal active:translate-y-px active:bg-petal/60 ${focusRing}`
const labelled = 'max-sm:w-auto max-sm:gap-2 max-sm:px-3 max-sm:text-sm'

function reservedLabel(g: GiftRow): string {
  const who = g.reservedByName ? `Reservado por ${g.reservedByName}` : 'Reservado'
  return g.status === 'declined' ? `${who} · recusou o convite` : who
}

function StatusBadge({ gift }: { gift: GiftRow }) {
  if (gift.status === 'free') return <Badge tone="sage">Livre</Badge>
  return <Badge tone={gift.status === 'declined' ? 'rose' : 'gold'}>{reservedLabel(gift)}</Badge>
}

/** Fixed square box; the name sits next to it, so the image itself is decorative. A URL that fails to load shows the placeholder. */
function Thumbnail({ url }: { url: string | null }) {
  const { failed, imgRef, onError } = useImageFailed(url)
  return (
    <span className="grid aspect-square size-12 shrink-0 place-items-center overflow-hidden rounded-[2px] border border-hairline bg-blush/50 text-muted">
      {url && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary store URLs, no next/image remote config
        <img
          src={url}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          ref={imgRef}
          onError={onError}
          className="size-full object-cover"
        />
      ) : (
        <ImageOff data-testid="thumbnail-placeholder" aria-hidden="true" className="size-[18px]" strokeWidth={1.5} />
      )}
    </span>
  )
}

function RowActions({
  gift,
  onEdit,
  onRelease,
  onDelete,
}: {
  gift: GiftRow
  onEdit: (g: GiftRow, trigger: HTMLElement) => void
  onRelease: (g: GiftRow, trigger: HTMLElement) => void
  onDelete: (g: GiftRow, trigger: HTMLElement) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 sm:flex-nowrap sm:justify-end">
      <button
        type="button"
        onClick={(e) => onEdit(gift, e.currentTarget)}
        aria-label={`Editar ${gift.name}`}
        title="Editar"
        className={`${iconButton} ${labelled}`}
      >
        <Pencil aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />
        <span aria-hidden="true" className="sm:hidden">
          Editar
        </span>
      </button>
      {gift.status !== 'free' && (
        <button
          type="button"
          onClick={(e) => onRelease(gift, e.currentTarget)}
          aria-label={`Liberar reserva de ${gift.name}`}
          title="Liberar reserva"
          className={`${iconButton} ${labelled}`}
        >
          <Undo2 aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />
          <span aria-hidden="true" className="sm:hidden">
            Liberar reserva
          </span>
        </button>
      )}
      <button
        type="button"
        onClick={(e) => onDelete(gift, e.currentTarget)}
        aria-label={`Excluir ${gift.name}`}
        title="Excluir"
        className={`${iconButton} ${labelled} hover:!text-error max-sm:ml-auto`}
      >
        <Trash2 aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />
        <span aria-hidden="true" className="sm:hidden">
          Excluir
        </span>
      </button>
    </div>
  )
}

export function GiftsTable({ gifts, description }: { gifts: GiftRow[]; description: string }) {
  const [sheet, setSheet] = useState<SheetState>(null)
  const [deleting, setDeleting] = useState<GiftRow | null>(null)
  const [releasing, setReleasing] = useState<GiftRow | null>(null)
  // where focus goes when a sheet/dialog closes (stashed explicitly: Safari doesn't focus clicked buttons)
  const returnFocus = useRef<HTMLElement | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const openSheet = (next: NonNullable<SheetState>, trigger: HTMLElement) => {
    returnFocus.current = trigger
    setSheet(next)
  }
  const [deletePending, startDelete] = useTransition()
  const [releasePending, startRelease] = useTransition()
  const toast = useToast()

  const categories = useMemo(
    () => [...new Set(gifts.map((g) => g.category))].sort(compareText),
    [gifts],
  )
  const filters = useMemo<DataTableFilter[]>(
    () =>
      categories.length > 1
        ? [STATUS_FILTER, { columnId: 'category', label: 'Categoria', options: categories.map((c) => ({ value: c, label: c })) }]
        : [STATUS_FILTER],
    [categories],
  )

  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor('name', {
          header: 'Presente',
          enableSorting: true,
          sortFn: (a, b) => compareText(a.original.name, b.original.name),
          meta: { searchable: true, card: 'primary' },
          cell: ({ row }) => (
            <div className="flex items-center gap-3">
              <Thumbnail url={row.original.imageUrl} />
              <div className="flex min-w-0 flex-col">
                <span className="font-medium text-wine max-sm:text-[17px]">{row.original.name}</span>
                <span className="text-[13px] text-muted">{row.original.category}</span>
              </div>
            </div>
          ),
        }),
        // filter + search only: the category is shown under the name
        helper.accessor('category', { header: 'Categoria', meta: { hidden: true, searchable: true } }),
        helper.accessor('reservedByName', { header: 'Reservado por', meta: { hidden: true, searchable: true } }),
        helper.accessor('priceCents', {
          header: 'Preço',
          enableSorting: true,
          sortFn: (a, b) => (a.original.priceCents ?? -1) - (b.original.priceCents ?? -1),
          meta: { className: 'whitespace-nowrap tabular-nums' },
          cell: (info) =>
            info.getValue() === null ? (
              <span className="text-muted">—</span>
            ) : (
              formatApproxPrice(info.getValue())
            ),
        }),
        helper.accessor('purchaseUrl', {
          header: 'Link',
          meta: {},
          cell: ({ row }) =>
            row.original.purchaseUrl ? (
              <a
                href={row.original.purchaseUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                aria-label={`Abrir link de compra de ${row.original.name} (abre em nova aba)`}
                className={`-mx-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-seal underline-offset-4 transition-colors duration-(--dur-micro) hover:text-wine hover:underline ${focusRing}`}
              >
                Abrir
                <ExternalLink aria-hidden="true" className="size-4" strokeWidth={1.75} />
              </a>
            ) : (
              <span className="text-muted">—</span>
            ),
        }),
        helper.accessor('status', {
          header: 'Situação',
          meta: { className: 'max-sm:col-span-2' },
          cell: ({ row }) => <StatusBadge gift={row.original} />,
        }),
        helper.display({
          id: 'actions',
          header: () => <span className="sr-only">Ações</span>,
          meta: { card: 'full', align: 'end', stickyEnd: true, className: 'sm:w-px' },
          cell: ({ row }) => (
            <RowActions
              gift={row.original}
              onEdit={(g, trigger) => {
                returnFocus.current = trigger
                setSheet({ kind: 'edit', gift: g })
              }}
              onRelease={(g, trigger) => {
                returnFocus.current = trigger
                setReleasing(g)
              }}
              onDelete={(g, trigger) => {
                returnFocus.current = trigger
                setDeleting(g)
              }}
            />
          ),
        }),
      ]),
    [],
  )

  function confirmDelete() {
    if (!deleting) return
    const target = deleting
    startDelete(async () => {
      const result = await deleteGiftAction(target.id)
      if (result.ok) {
        toast.success(result.changed ? 'Presente excluído.' : 'Esse presente já tinha sido excluído.')
        // the row (and its trigger) is gone: continue from the search field
        returnFocus.current = searchRef.current
        setDeleting(null)
      } else {
        toast.error('Não foi possível excluir o presente. Tente de novo.')
      }
    })
  }

  function confirmRelease() {
    if (!releasing) return
    const target = releasing
    startRelease(async () => {
      const result = await releaseGiftAction(target.id)
      if (result.ok) {
        toast.success(result.changed ? 'Reserva liberada.' : 'Essa reserva já estava liberada.')
        // the "Liberar reserva" button disappears with the reservation
        returnFocus.current = searchRef.current
        setReleasing(null)
      } else {
        toast.error('Não foi possível liberar a reserva. Tente de novo.')
      }
    })
  }

  const closeSheet = () => setSheet(null)

  const emptyState = (
    <div className="flex flex-col items-center gap-5 border border-dashed border-hairline-strong bg-paper px-6 py-16 text-center">
      <span aria-hidden="true" className="grid size-14 place-items-center rounded-full bg-blush text-seal">
        <Gift className="size-6" strokeWidth={1.5} />
      </span>
      <div className="flex flex-col gap-1.5">
        <p className="text-lg font-medium">Nenhum presente ainda</p>
        <p className="max-w-[44ch] text-[15px] text-muted">
          Monte a lista com sugestões, preços aproximados e links de compra. Cada convidado reserva o que vai dar.
        </p>
      </div>
      <Button
        icon={<Gift aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />}
        onClick={(e) => openSheet({ kind: 'new' }, e.currentTarget)}
      >
        Adicionar presente
      </Button>
    </div>
  )

  return (
    <>
      <PageHeader
        title="Presentes"
        description={description}
        actions={
          <Button
            className="max-sm:flex-1"
            icon={<Gift aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />}
            onClick={(e) => openSheet({ kind: 'new' }, e.currentTarget)}
          >
            Adicionar presente
          </Button>
        }
      />

      <DataTable
        data={gifts}
        columns={columns}
        getRowId={(g) => g.id}
        // no initial sort: keep the server order (category, then order, then name), as the invite shows it
        searchInputRef={searchRef}
        regionLabel="Tabela de presentes"
        searchLabel="Buscar presente"
        searchPlaceholder="Buscar por presente, categoria ou convidado"
        searchPlaceholderPhone="Buscar presente"
        filters={filters}
        emptyState={emptyState}
        emptyMessage="Nenhum presente encontrado com essa busca."
      />

      {sheet && (
        <Sheet
          returnFocusRef={returnFocus}
          id="gift-sheet"
          title={sheet.kind === 'new' ? 'Novo presente' : 'Editar presente'}
          description={sheet.kind === 'new' ? 'Aparece na lista de presentes do convite.' : sheet.gift.name}
          onClose={closeSheet}
        >
          <GiftForm
            key={sheet.kind === 'new' ? 'new' : sheet.gift.id}
            categories={categories}
            gift={
              sheet.kind === 'edit'
                ? {
                    id: sheet.gift.id,
                    name: sheet.gift.name,
                    category: sheet.gift.category,
                    price: priceInputValue(sheet.gift.priceCents),
                    purchaseUrl: sheet.gift.purchaseUrl ?? '',
                    imageUrl: sheet.gift.imageUrl ?? '',
                    sortOrder: sheet.gift.sortOrder,
                  }
                : undefined
            }
            onSaved={closeSheet}
            onCancel={closeSheet}
          />
        </Sheet>
      )}

      {releasing && (
        <ConfirmDialog
          returnFocusRef={returnFocus}
          title="Liberar reserva?"
          confirmLabel="Liberar reserva"
          pendingLabel="Liberando…"
          pending={releasePending}
          onConfirm={confirmRelease}
          onCancel={() => setReleasing(null)}
        >
          <p>
            <strong className="font-medium text-wine">{releasing.name}</strong> volta a ficar livre para os
            convidados
            {releasing.reservedByName ? ` e sai da lista de ${releasing.reservedByName}` : ''}.
          </p>
        </ConfirmDialog>
      )}

      {deleting && (
        <ConfirmDialog
          returnFocusRef={returnFocus}
          title="Excluir presente?"
          confirmLabel="Excluir"
          pendingLabel="Excluindo…"
          pending={deletePending}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        >
          <p>
            <strong className="font-medium text-wine">{deleting.name}</strong> sai da lista de presentes. Não dá
            para desfazer.
          </p>
          {deleting.status !== 'free' && (
            <p className="mt-2 text-deep-rose">
              Atenção: está reservado por {deleting.reservedByName ?? 'um convidado'}. A reserva também será
              desfeita.
            </p>
          )}
        </ConfirmDialog>
      )}
    </>
  )
}
