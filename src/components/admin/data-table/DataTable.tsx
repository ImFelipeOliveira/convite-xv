'use client'

import {
  columnFilteringFeature,
  createColumnHelper,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  FlexRender,
  functionalUpdate,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  tableFeatures,
  useTable,
  type ColumnDef,
  type FilterFn,
  type RowData,
  type SortingState,
} from '@tanstack/react-table'
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type Ref,
} from 'react'
import { buttonClass, focusRing, inputClass } from '../styles'
import { CloseButton, Modal } from '../ui/Modal'
import { formatRange, matchesSearch } from './helpers'

export type DataTableColumnMeta = {
  /** Label used on the stacked mobile card (defaults to the string header). */
  label?: string
  /** Included in the global text search. */
  searchable?: boolean
  /** 'primary' = card title (full width, no label); 'full' = full-width footer (row actions). */
  card?: 'primary' | 'full'
  /** Hidden between 640px and 1280px, where the table is narrowest. */
  hideOnTablet?: boolean
  /** Hidden between 640px and 1024px (tablet without the sidebar). */
  hideOnSmallTablet?: boolean
  align?: 'start' | 'end'
  /** Pinned to the right edge while the table scrolls sideways (row actions). */
  stickyEnd?: boolean
  /** Not rendered: the column only feeds the chip filters (e.g. a category shown inside another cell). */
  hidden?: boolean
  className?: string
}

export const dataTableFeatures = tableFeatures({
  rowSortingFeature,
  columnFilteringFeature,
  globalFilteringFeature,
  rowPaginationFeature,
  sortedRowModel: createSortedRowModel(),
  filteredRowModel: createFilteredRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic },
  columnMeta: {} as DataTableColumnMeta,
})

type Features = typeof dataTableFeatures
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DataTableColumn<T extends RowData> = ColumnDef<Features, T, any>
export const createDataTableColumnHelper = <T extends RowData>() => createColumnHelper<Features, T>()

export type DataTableFilter = {
  columnId: string
  label: string
  options: { value: string; label: string }[]
}

type Props<T extends RowData> = {
  data: T[]
  columns: DataTableColumn<T>[]
  getRowId?: (row: T) => string
  initialSorting?: SortingState
  searchLabel?: string
  searchPlaceholder?: string
  /** Shorter placeholder for phones (the field is narrow next to "Filtros"). */
  searchPlaceholderPhone?: string
  filters?: DataTableFilter[]
  /** Chip selections to start with (e.g. from query params): { columnId: value }. */
  initialFilters?: Record<string, string>
  /** Called whenever the chip selections change ({ columnId: value }, unselected columns omitted). */
  onFiltersChange?: (filters: Record<string, string>) => void
  /** Shown when there is no data at all (with the primary actions). */
  emptyState?: ReactNode
  /** Shown when search/filters match nothing. */
  emptyMessage: string
  pageSize?: number
  searchInputRef?: Ref<HTMLInputElement>
  /** Accessible name of the (horizontally scrollable) table region. */
  regionLabel?: string
}

// rows whose value equals the selected option (undefined = no filter)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const equalsFilter: FilterFn<Features, any> = (row, columnId, value) =>
  value === undefined || row.getValue(columnId) === value

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const globalSearch: FilterFn<Features, any> = (row, columnId, query) =>
  matchesSearch(row.getValue(columnId), String(query ?? ''))

function sortIcon(dir: false | 'asc' | 'desc') {
  const cls = 'size-4 shrink-0'
  if (dir === 'asc') return <ArrowUp aria-hidden="true" className={cls} strokeWidth={1.75} />
  if (dir === 'desc') return <ArrowDown aria-hidden="true" className={cls} strokeWidth={1.75} />
  return (
    <ChevronsUpDown
      aria-hidden="true"
      className={`${cls} opacity-45 group-hover:opacity-80`}
      strokeWidth={1.75}
    />
  )
}

const tabletHidden = 'sm:max-xl:hidden'
const smallTabletHidden = 'sm:max-lg:hidden'
const stickyEndCell =
  'sm:sticky sm:right-0 sm:z-[1] sm:bg-paper sm:shadow-[-10px_0_10px_-10px_rgba(90,33,54,.25)]'
const hiddenClass = (meta?: DataTableColumnMeta) =>
  meta?.hideOnTablet ? tabletHidden : meta?.hideOnSmallTablet ? smallTabletHidden : ''

const PHONE_QUERY = '(max-width: 639.98px)'
function subscribePhone(onChange: () => void) {
  const mq = window.matchMedia(PHONE_QUERY)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}
/** Below the `sm` breakpoint (640px); false while server rendering. */
function useIsPhone(): boolean {
  return useSyncExternalStore(
    subscribePhone,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false,
  )
}

export function DataTable<T extends RowData>({
  data,
  columns,
  getRowId,
  initialSorting = [],
  searchLabel = 'Buscar',
  searchPlaceholder,
  searchPlaceholderPhone,
  filters = [],
  initialFilters,
  onFiltersChange,
  emptyState,
  emptyMessage,
  pageSize = 20,
  searchInputRef,
  regionLabel = 'Tabela',
}: Props<T>) {
  const uid = useId()
  const [pageIndexRequested, setPageIndex] = useState(0)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const filtersButtonRef = useRef<HTMLButtonElement>(null)
  const isPhone = useIsPhone()
  // the bottom sheet is a phone-only control: close it when the viewport grows past 640px (rotation)
  if (filtersOpen && !isPhone) setFiltersOpen(false) // render-phase state adjustment

  const defaultColumn = useMemo(() => ({ enableSorting: false, filterFn: equalsFilter }), [])

  const table = useTable({
    features: dataTableFeatures,
    columns,
    data,
    getRowId,
    defaultColumn,
    initialState: {
      sorting: initialSorting,
      columnFilters: Object.entries(initialFilters ?? {}).map(([id, value]) => ({ id, value })),
    },
    // pagination is controlled: the index is clamped below so it stays valid after deletions
    state: { pagination: { pageIndex: pageIndexRequested, pageSize } },
    onPaginationChange: (updater) =>
      setPageIndex((index) => functionalUpdate(updater, { pageIndex: index, pageSize }).pageIndex),
    enableSortingRemoval: false,
    globalFilterFn: globalSearch,
    getColumnCanGlobalFilter: (column) =>
      (column.columnDef.meta as DataTableColumnMeta | undefined)?.searchable === true,
    autoResetPageIndex: false,
  })

  const globalFilter = String(table.state.globalFilter ?? '')
  const filtersKey = JSON.stringify(table.state.columnFilters)
  const onFiltersChangeRef = useRef(onFiltersChange)
  useEffect(() => {
    onFiltersChangeRef.current = onFiltersChange
  })
  const reportedKey = useRef(filtersKey)
  useEffect(() => {
    if (reportedKey.current === filtersKey) return
    reportedKey.current = filtersKey
    const list = JSON.parse(filtersKey) as { id: string; value: unknown }[]
    onFiltersChangeRef.current?.(
      Object.fromEntries(list.filter((f) => f.value !== undefined).map((f) => [f.id, String(f.value)])),
    )
  }, [filtersKey])
  const filteredCount = table.getFilteredRowModel().rows.length
  const pageCount = Math.max(1, Math.ceil(filteredCount / pageSize))
  const pageIndex = Math.min(pageIndexRequested, pageCount - 1)
  if (pageIndex !== pageIndexRequested) setPageIndex(pageIndex) // render-phase state adjustment

  const goTo = (index: number) => setPageIndex(index)
  const resetPage = () => goTo(0)

  const counts = useMemo(() => {
    const out: Record<string, Record<string, number>> = {}
    for (const f of filters) {
      const byValue: Record<string, number> = {}
      for (const row of table.getCoreRowModel().rows) {
        const v = String(row.getValue(f.columnId))
        byValue[v] = (byValue[v] ?? 0) + 1
      }
      out[f.columnId] = byValue
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, filters])

  if (data.length === 0 && emptyState) return <>{emptyState}</>

  const rows = table.getRowModel().rows
  const hasActiveFilters = globalFilter !== '' || table.state.columnFilters.length > 0

  const activeFilters = table.state.columnFilters.length
  const renderFilterGroups = (where: 'bar' | 'sheet') =>
    filters.map((f) => {
      const column = table.getColumn(f.columnId)
      const current = column?.getFilterValue() as string | undefined
      const groupId = `${uid}-${where}-${f.columnId}-label`
      const chips = [{ value: undefined, label: 'Todas' }, ...f.options]
      return (
        <div
          key={f.columnId}
          role="group"
          aria-labelledby={groupId}
          className="flex flex-wrap items-center gap-2"
        >
          <span id={groupId} className="mr-1 text-sm text-muted max-sm:w-full">
            {f.label}
          </span>
          {chips.map((opt) => {
            const pressed = current === opt.value
            const count = opt.value === undefined ? data.length : (counts[f.columnId]?.[opt.value] ?? 0)
            return (
              <button
                key={opt.label}
                type="button"
                aria-pressed={pressed}
                onClick={() => {
                  column?.setFilterValue(opt.value)
                  resetPage()
                }}
                className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm transition-[background-color,border-color,color] duration-(--dur-micro) ease-(--ease-letter) active:translate-y-px ${focusRing} ${
                  pressed
                    ? 'border-wine bg-wine text-paper'
                    : 'border-hairline-strong bg-paper text-wine hover:border-seal hover:bg-blush'
                }`}
              >
                {opt.label}
                <span
                  aria-hidden="true"
                  className={`min-w-5 rounded-full px-1.5 text-center text-xs tabular-nums ${
                    pressed ? 'bg-paper/20' : 'bg-blush text-muted'
                  }`}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      )
    })

  return (
    <div className="flex flex-col gap-4">
      {/* toolbar */}
      <div
        className={`flex flex-col gap-3 ${
          // several filter groups get their own wrapping row under the search
          filters.length > 1 ? '' : 'lg:flex-row lg:items-center lg:justify-between'
        }`}
      >
        <div className="flex w-full items-center gap-2 lg:max-w-sm">
          <div className="relative min-w-0 flex-1">
            <label htmlFor={`${uid}-search`} className="sr-only">
              {searchLabel}
            </label>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3.5 size-[18px] -translate-y-1/2 text-muted"
              strokeWidth={1.75}
            />
            <input
              ref={searchInputRef}
              id={`${uid}-search`}
              type="search"
              value={globalFilter}
              onChange={(e) => {
                table.setGlobalFilter(e.target.value)
                resetPage()
              }}
              placeholder={isPhone && searchPlaceholderPhone ? searchPlaceholderPhone : searchPlaceholder}
              autoComplete="off"
              className={`${inputClass} pr-11 pl-10 [&::-webkit-search-cancel-button]:hidden`}
            />
            {globalFilter && (
              <button
                type="button"
                onClick={() => {
                  table.setGlobalFilter('')
                  resetPage()
                }}
                aria-label="Limpar busca"
                className={`absolute top-1/2 right-0.5 grid size-10 -translate-y-1/2 place-items-center rounded-full text-muted transition-colors duration-(--dur-micro) hover:bg-blush hover:text-wine ${focusRing}`}
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            )}
          </div>
          {filters.length > 0 && (
            // phones: the chip groups live in a bottom sheet so the first rows stay above the fold
            <button
              ref={filtersButtonRef}
              type="button"
              onClick={() => setFiltersOpen(true)}
              aria-haspopup="dialog"
              className={`${buttonClass(activeFilters > 0 ? 'primary' : 'secondary')} shrink-0 px-4 sm:hidden`}
            >
              <SlidersHorizontal aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />
              {activeFilters > 0 ? `Filtros · ${activeFilters}` : 'Filtros'}
            </button>
          )}
        </div>

        {filters.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-8 gap-y-3 max-sm:hidden">{renderFilterGroups('bar')}</div>
        )}
      </div>

      {filtersOpen && (
        <Modal
          placement="bottom"
          labelledBy={`${uid}-filters-title`}
          returnFocusRef={filtersButtonRef}
          onClose={() => setFiltersOpen(false)}
        >
          <div className="flex max-h-[85dvh] flex-col">
            <div className="flex items-center gap-3 border-b border-hairline py-2 pr-2 pl-5">
              <h2 id={`${uid}-filters-title`} className="flex-1 font-display text-[24px] leading-tight">
                Filtros
              </h2>
              <CloseButton onClick={() => setFiltersOpen(false)} />
            </div>
            <div className="flex flex-col gap-5 overflow-y-auto px-5 py-5">{renderFilterGroups('sheet')}</div>
            <div className="flex gap-2 border-t border-hairline px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={() => {
                  table.setColumnFilters([])
                  resetPage()
                }}
                disabled={activeFilters === 0}
                className={`${buttonClass('secondary')} flex-1`}
              >
                Limpar filtros
              </button>
              <button
                type="button"
                data-autofocus
                onClick={() => setFiltersOpen(false)}
                className={`${buttonClass('primary')} flex-1`}
              >
                Ver resultados ({filteredCount})
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* table (cards below 640px, see globals.css .dt-table) */}
      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 border border-dashed border-hairline-strong bg-paper px-6 py-14 text-center">
          <Search aria-hidden="true" className="size-6 text-muted" strokeWidth={1.5} />
          <p className="text-[15px] text-wine">{emptyMessage}</p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                table.setGlobalFilter('')
                table.setColumnFilters([])
                resetPage()
              }}
              className={buttonClass('secondary', 'sm')}
            >
              Limpar filtros
            </button>
          )}
        </div>
      ) : (
        // wide tables scroll inside their own box; the page itself never scrolls sideways.
        // (being a scroll container, the box can't keep the header pinned to the page)
        <div
          role="region"
          aria-label={regionLabel}
          tabIndex={0}
          className={`sm:overflow-x-auto sm:border sm:border-hairline sm:bg-paper sm:shadow-paper ${focusRing}`}
        >
          <table role="table" className="dt-table w-full border-collapse text-left text-[15px]">
            <thead role="rowgroup">
              {table.getHeaderGroups().map((group) => (
                <tr role="row" key={group.id}>
                  {group.headers
                    .filter((header) => !header.column.columnDef.meta?.hidden)
                    .map((header) => {
                    const meta = header.column.columnDef.meta
                    const canSort = header.column.getCanSort()
                    const dir = header.column.getIsSorted()
                    return (
                      <th
                        role="columnheader"
                        key={header.id}
                        scope="col"
                        aria-sort={
                          canSort
                            ? dir === 'asc'
                              ? 'ascending'
                              : dir === 'desc'
                                ? 'descending'
                                : 'none'
                            : undefined
                        }
                        className={`border-b border-hairline-strong bg-blush px-4 py-0 text-[13px] font-medium whitespace-nowrap text-muted ${
                          meta?.align === 'end' ? 'text-right' : ''
                        } ${meta?.stickyEnd ? 'sm:sticky sm:right-0 sm:z-[2]' : ''} ${hiddenClass(meta)}`}
                      >
                        {canSort ? (
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className={`group -mx-2 inline-flex min-h-12 items-center gap-1.5 rounded-sm px-2 transition-colors duration-(--dur-micro) hover:text-wine ${focusRing} ${
                              dir ? 'text-wine' : ''
                            }`}
                          >
                            <FlexRender header={header} />
                            {sortIcon(dir)}
                          </button>
                        ) : (
                          <span className="inline-flex min-h-12 items-center">
                            <FlexRender header={header} />
                          </span>
                        )}
                      </th>
                    )
                  })}
                </tr>
              ))}
            </thead>
            <tbody role="rowgroup">
              {rows.map((row) => (
                <tr
                  role="row"
                  key={row.id}
                  className="transition-colors duration-(--dur-micro) sm:border-b sm:border-hairline sm:last:border-b-0 sm:hover:bg-blush/45"
                >
                  {row
                    .getAllCells()
                    .filter((cell) => !cell.column.columnDef.meta?.hidden)
                    .map((cell) => {
                    const meta = cell.column.columnDef.meta
                    const header = cell.column.columnDef.header
                    const label = meta?.label ?? (typeof header === 'string' ? header : undefined)
                    return (
                      <td
                        role="cell"
                        key={cell.id}
                        data-label={meta?.card ? undefined : label}
                        data-card={meta?.card}
                        className={`px-4 py-2 align-middle sm:h-16 ${meta?.align === 'end' ? 'sm:text-right' : ''} ${hiddenClass(
                          meta,
                        )} ${meta?.stickyEnd ? stickyEndCell : ''} ${meta?.className ?? ''}`}
                      >
                        <FlexRender cell={cell} />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* pagination */}
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
        <p aria-live="polite" className="text-sm text-muted tabular-nums">
          {formatRange(pageIndex, pageSize, filteredCount)}
        </p>
        {pageCount > 1 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => goTo(pageIndex - 1)}
              disabled={pageIndex === 0}
              className={buttonClass('secondary', 'sm')}
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
              Anterior
            </button>
            <span className="px-1 text-sm text-muted tabular-nums">
              {pageIndex + 1} / {pageCount}
            </span>
            <button
              type="button"
              onClick={() => goTo(pageIndex + 1)}
              disabled={pageIndex >= pageCount - 1}
              className={buttonClass('secondary', 'sm')}
            >
              Próxima
              <ChevronRight aria-hidden="true" className="size-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
