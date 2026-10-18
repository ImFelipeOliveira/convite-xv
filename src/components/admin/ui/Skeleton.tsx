export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block animate-[shimmer_1.6s_linear_infinite] rounded-[2px] bg-[linear-gradient(90deg,rgba(240,199,198,.35)_0%,rgba(247,222,219,.9)_50%,rgba(240,199,198,.35)_100%)] bg-size-[200%_100%] ${className}`}
    />
  )
}

/** Generic page placeholder while a panel page streams in. */
export function PageSkeleton({ variant = 'table' }: { variant?: 'table' | 'cards' | 'form' }) {
  return (
    <div role="status" aria-label="Carregando" className="flex flex-col gap-8">
      <div className="flex flex-col gap-3 border-b border-hairline pb-6">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      {variant === 'cards' && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      )}
      {variant === 'table' && <TableSkeleton />}
      {variant === 'form' && (
        <div className="flex max-w-2xl flex-col gap-5">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-11" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <Skeleton className="h-11 flex-1" />
        <Skeleton className="h-11 w-72 max-w-full" />
      </div>
      <div className="flex flex-col border border-hairline bg-paper">
        <Skeleton className="h-12 rounded-none" />
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-t border-hairline px-4 py-4">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-1/5" />
            <Skeleton className="ml-auto h-6 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
