'use client'

import { Download, Ellipsis, FileUp, Link2, MessageCircle, Pencil, Trash2, UserPlus, Users } from 'lucide-react'
import { useMemo, useRef, useState, useTransition } from 'react'
import { deleteGuestAction } from '@/features/guests/actions'
import { createDataTableColumnHelper, DataTable, type DataTableFilter } from './data-table/DataTable'
import { compareText, formatBoaVistaDateTime } from './data-table/helpers'
import { buttonClass, focusRing } from './styles'
import { GuestForm } from './GuestForm'
import { GuestImportForm } from './GuestImportForm'
import { SendInviteButton, type LastInvite } from './SendInviteButton'
import { RsvpBadge, type RsvpStatusValue } from './ui/Badge'
import { Button } from './ui/Button'
import { PageHeader } from './ui/PageHeader'
import { ConfirmDialog } from './ui/ConfirmDialog'
import { useReopenDraftSheet, useSkewGuard } from './skew-recovery'
import { CloseButton, Modal, Sheet } from './ui/Modal'
import { useToast } from './ui/Toast'

/** Only what the table shows or its actions need (already authorized on the server). */
export type GuestRow = {
  id: string
  name: string
  /** formatted for display, '' when missing */
  phone: string
  plusOnesLimit: number
  rsvpStatus: RsvpStatusValue
  /** confirmed people (1 + plus-ones) when "yes", 0 when "no", null when pending */
  people: number | null
  openedAt: string | null
  inviteUrl: string
  whatsappUrl: string
  hasPhone: boolean
  /** latest invite sent through the WhatsApp integration (at = ISO) */
  lastInvite: LastInvite
  /** filter value of the "Convite" chips (`sending` counts as sent) */
  inviteStatus: 'none' | 'sent' | 'failed'
}

type SheetState = { kind: 'new' } | { kind: 'edit'; guest: GuestRow } | { kind: 'import' } | null

const helper = createDataTableColumnHelper<GuestRow>()

const FILTERS: DataTableFilter[] = [
  {
    columnId: 'rsvpStatus',
    label: 'Resposta',
    options: [
      { value: 'pending', label: 'Pendente' },
      { value: 'yes', label: 'Sim' },
      { value: 'no', label: 'Não' },
    ],
  },
  {
    columnId: 'inviteStatus',
    label: 'Convite',
    options: [
      { value: 'none', label: 'Não enviado' },
      { value: 'sent', label: 'Enviado' },
      { value: 'failed', label: 'Falhou' },
    ],
  },
]

const moreItem = `flex min-h-12 items-center gap-3 rounded-[2px] px-3 text-left text-[16px] text-wine transition-colors duration-(--dur-micro) hover:bg-blush active:bg-petal/60 ${focusRing}`

const iconButton = `grid size-11 shrink-0 place-items-center rounded-full text-wine transition-[background-color,color,transform] duration-(--dur-micro) ease-(--ease-letter) hover:bg-blush hover:text-seal active:translate-y-px active:bg-petal/60 ${focusRing}`

function RowActions({
  guest,
  onEdit,
  onDelete,
}: {
  guest: GuestRow
  onEdit: (g: GuestRow, trigger: HTMLElement) => void
  onDelete: (g: GuestRow, trigger: HTMLElement) => void
}) {
  const toast = useToast()
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(guest.inviteUrl)
      toast.success('Link copiado')
    } catch {
      toast.error('Não foi possível copiar o link. Tente de novo.')
    }
  }
  const labelled = 'max-sm:w-auto max-sm:gap-2 max-sm:px-3 max-sm:text-sm'
  return (
    <div className="flex flex-wrap items-center gap-1 sm:max-xl:grid sm:max-xl:grid-cols-[repeat(2,2.75rem)] sm:flex-nowrap sm:justify-end">
      <button
        type="button"
        onClick={copyLink}
        aria-label={`Copiar link de ${guest.name}`}
        title="Copiar link"
        className={`${iconButton} ${labelled}`}
      >
        <Link2 aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />
        <span aria-hidden="true" className="sm:hidden">
          Copiar link
        </span>
      </button>
      <a
        href={guest.whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Abrir no WhatsApp — ${guest.name}`}
        title="Abrir no WhatsApp"
        className={`${iconButton} ${labelled}`}
      >
        <MessageCircle aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />
        <span aria-hidden="true" className="sm:hidden">
          WhatsApp
        </span>
      </a>
      <button
        type="button"
        onClick={(e) => onEdit(guest, e.currentTarget)}
        aria-label={`Editar ${guest.name}`}
        title="Editar"
        className={`${iconButton} ${labelled}`}
      >
        <Pencil aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />
        <span aria-hidden="true" className="sm:hidden">
          Editar
        </span>
      </button>
      <button
        type="button"
        onClick={(e) => onDelete(guest, e.currentTarget)}
        aria-label={`Excluir ${guest.name}`}
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

export function GuestsTable({ guests, description }: { guests: GuestRow[]; description: string }) {
  const [sheet, setSheet] = useState<SheetState>(null)
  const [deleting, setDeleting] = useState<GuestRow | null>(null)
  // where focus goes when a sheet/dialog closes (stashed explicitly: Safari doesn't focus clicked buttons)
  const returnFocus = useRef<HTMLElement | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const openSheet = (next: NonNullable<SheetState>, trigger: HTMLElement) => {
    returnFocus.current = trigger
    setSheet(next)
  }
  const [pending, startTransition] = useTransition()
  const toast = useToast()
  const guard = useSkewGuard()
  // reloaded after a deploy mid-edit: reopen the sheet that had the draft
  useReopenDraftSheet('guest:', (rest) => {
    if (rest === 'new') return setSheet({ kind: 'new' })
    const guest = guests.find((g) => g.id === rest)
    if (guest) setSheet({ kind: 'edit', guest })
  })
  const [moreOpen, setMoreOpen] = useState(false)
  const moreButton = useRef<HTMLButtonElement>(null)

  const columns = useMemo(
    () =>
      helper.columns([
        helper.accessor('name', {
          header: 'Nome',
          enableSorting: true,
          sortFn: (a, b) => compareText(a.original.name, b.original.name),
          meta: { searchable: true, card: 'primary' },
          cell: (info) => <span className="font-medium text-wine max-sm:text-[17px]">{info.getValue()}</span>,
        }),
        helper.accessor('phone', {
          header: 'Telefone',
          meta: { searchable: true, className: 'whitespace-nowrap tabular-nums' },
          cell: (info) => info.getValue() || <span className="text-muted">—</span>,
        }),
        helper.accessor('plusOnesLimit', {
          header: 'Limite',
          enableSorting: true,
          meta: { hideOnTablet: true, className: 'tabular-nums' },
        }),
        helper.accessor('rsvpStatus', {
          header: 'Resposta',
          meta: {},
          cell: (info) => <RsvpBadge status={info.getValue()} />,
        }),
        helper.accessor('inviteStatus', {
          id: 'inviteStatus',
          header: 'WhatsApp',
          // full card width on phones (status + button don't fit half a card)
          meta: { className: 'max-sm:col-span-2 xl:whitespace-nowrap' },
          cell: ({ row }) => (
            <SendInviteButton
              guest={{
                id: row.original.id,
                name: row.original.name,
                hasPhone: row.original.hasPhone,
                lastInvite: row.original.lastInvite,
              }}
            />
          ),
        }),
        helper.accessor('people', {
          header: 'Pessoas',
          meta: { hideOnSmallTablet: true, className: 'tabular-nums' },
          cell: (info) => info.getValue() ?? <span className="text-muted">—</span>,
        }),
        helper.accessor('openedAt', {
          header: 'Abriu o convite',
          meta: { hideOnTablet: true, label: 'Abriu', className: 'whitespace-nowrap' },
          cell: (info) =>
            info.getValue() ? (
              formatBoaVistaDateTime(info.getValue())
            ) : (
              <span className="text-muted">Ainda não</span>
            ),
        }),
        helper.display({
          id: 'actions',
          header: () => <span className="sr-only">Ações</span>,
          meta: { card: 'full', align: 'end', stickyEnd: true, className: 'sm:w-px' },
          cell: ({ row }) => (
            <RowActions
              guest={row.original}
              onEdit={(g, trigger) => {
                returnFocus.current = trigger
                setSheet({ kind: 'edit', guest: g })
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
    startTransition(async () => {
      const result = await guard(() => deleteGuestAction(target.id))
      if (!result) return
      if (result.ok) {
        toast.success('Convidado excluído.')
        // the row (and its trigger) is gone: continue from the search field
        returnFocus.current = searchRef.current
        setDeleting(null)
      } else {
        toast.error('Não foi possível excluir o convidado. Tente de novo.')
      }
    })
  }

  const closeSheet = () => setSheet(null)

  const emptyState = (
    <div className="flex flex-col items-center gap-5 border border-dashed border-hairline-strong bg-paper px-6 py-16 text-center">
      <span aria-hidden="true" className="grid size-14 place-items-center rounded-full bg-blush text-seal">
        <Users className="size-6" strokeWidth={1.5} />
      </span>
      <div className="flex flex-col gap-1.5">
        <p className="text-lg font-medium">Nenhum convidado ainda</p>
        <p className="max-w-[44ch] text-[15px] text-muted">
          Adicione os convidados um a um ou importe a planilha da família. Cada um recebe um link pessoal.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button
          icon={<UserPlus aria-hidden="true" className="size-[18px]" />}
          onClick={(e) => openSheet({ kind: 'new' }, e.currentTarget)}
        >
          Adicionar convidado
        </Button>
        <Button
          variant="secondary"
          icon={<FileUp aria-hidden="true" className="size-[18px]" />}
          onClick={(e) => openSheet({ kind: 'import' }, e.currentTarget)}
        >
          Importar planilha
        </Button>
      </div>
    </div>
  )

  return (
    <>
      <PageHeader
        title="Convidados"
        description={description}
        actions={
          <>
            <Button
              className="max-sm:flex-1"
              icon={<UserPlus aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />}
              onClick={(e) => openSheet({ kind: 'new' }, e.currentTarget)}
            >
              Adicionar convidado
            </Button>
            <Button
              variant="secondary"
              className="max-sm:hidden"
              icon={<FileUp aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />}
              onClick={(e) => openSheet({ kind: 'import' }, e.currentTarget)}
            >
              Importar planilha
            </Button>
            <a href="/admin/guests/export" download className={`${buttonClass('ghost')} max-sm:hidden`}>
              <Download aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />
              Exportar CSV
            </a>
            {/* phones: secondary actions behind "Mais" so the list starts above the fold */}
            <button
              ref={moreButton}
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              aria-label="Mais ações"
              title="Mais ações"
              className={`${buttonClass('secondary', 'icon')} sm:hidden`}
            >
              <Ellipsis aria-hidden="true" className="size-5" strokeWidth={1.75} />
            </button>
          </>
        }
      />

      {moreOpen && (
        <Modal
          placement="bottom"
          labelledBy="more-actions-title"
          returnFocusRef={moreButton}
          onClose={() => setMoreOpen(false)}
        >
          <div className="flex flex-col pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center gap-3 border-b border-hairline py-2 pr-2 pl-5">
              <h2 id="more-actions-title" className="flex-1 font-display text-[24px] leading-tight">
                Mais ações
              </h2>
              <CloseButton onClick={() => setMoreOpen(false)} />
            </div>
            <div className="flex flex-col px-2 py-2">
              <button
                type="button"
                data-autofocus
                onClick={() => {
                  setMoreOpen(false)
                  // the import sheet returns focus to the "Mais" button
                  if (moreButton.current) openSheet({ kind: 'import' }, moreButton.current)
                }}
                className={moreItem}
              >
                <FileUp aria-hidden="true" className="size-5" strokeWidth={1.75} />
                Importar planilha
              </button>
              <a href="/admin/guests/export" download onClick={() => setMoreOpen(false)} className={moreItem}>
                <Download aria-hidden="true" className="size-5" strokeWidth={1.75} />
                Exportar CSV
              </a>
            </div>
          </div>
        </Modal>
      )}

      <DataTable
        data={guests}
        columns={columns}
        getRowId={(g) => g.id}
        initialSorting={[{ id: 'name', desc: false }]}
        searchInputRef={searchRef}
        regionLabel="Tabela de convidados"
        searchLabel="Buscar convidado"
        searchPlaceholder="Buscar por nome ou telefone"
        searchPlaceholderPhone="Buscar convidado"
        filters={FILTERS}
        emptyState={emptyState}
        emptyMessage="Nenhum convidado encontrado com essa busca."
      />

      {sheet?.kind === 'new' && (
        <Sheet
          returnFocusRef={returnFocus}
          id="guest-sheet"
          title="Novo convidado"
          description="O link pessoal é criado ao salvar."
          onClose={closeSheet}
        >
          <GuestForm onSaved={closeSheet} onCancel={closeSheet} />
        </Sheet>
      )}
      {sheet?.kind === 'edit' && (
        <Sheet
          returnFocusRef={returnFocus}
          id="guest-sheet"
          title="Editar convidado"
          description={sheet.guest.name}
          onClose={closeSheet}
        >
          <GuestForm
            guest={{
              id: sheet.guest.id,
              name: sheet.guest.name,
              phone: sheet.guest.phone,
              plusOnesLimit: sheet.guest.plusOnesLimit,
            }}
            onSaved={closeSheet}
            onCancel={closeSheet}
          />
        </Sheet>
      )}
      {sheet?.kind === 'import' && (
        <Sheet
          returnFocusRef={returnFocus}
          id="import-sheet"
          title="Importar planilha"
          description="Adicione vários convidados de uma vez."
          onClose={closeSheet}
        >
          <GuestImportForm
            onImported={(r) => {
              if (r.errors.length === 0) closeSheet()
            }}
          />
        </Sheet>
      )}

      {deleting && (
        <ConfirmDialog
          returnFocusRef={returnFocus}
          title="Excluir convidado?"
          confirmLabel="Excluir"
          pendingLabel="Excluindo…"
          pending={pending}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        >
          <p>
            <strong className="font-medium text-wine">{deleting.name}</strong> sai da lista e o link pessoal
            deixa de funcionar. Não dá para desfazer.
          </p>
        </ConfirmDialog>
      )}
    </>
  )
}
