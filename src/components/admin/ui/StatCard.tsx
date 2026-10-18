import type { ReactNode } from 'react'

export function StatCard({
  icon,
  value,
  label,
  hint,
  emphasis = false,
}: {
  icon: ReactNode
  value: number | string
  label: string
  hint?: string
  emphasis?: boolean
}) {
  return (
    <div
      className={`flex min-h-32 flex-col justify-between gap-4 border p-5 shadow-paper ${
        emphasis ? 'border-seal bg-seal text-paper' : 'border-hairline bg-paper text-wine'
      }`}
    >
      <span
        aria-hidden="true"
        className={`grid size-10 place-items-center rounded-full ${emphasis ? 'bg-paper/15 text-paper' : 'bg-blush text-seal'}`}
      >
        {icon}
      </span>
      <div className="flex flex-col gap-0.5">
        <span className="text-[34px] leading-none font-light tabular-nums">{value}</span>
        <span className={`text-sm font-medium ${emphasis ? 'text-paper' : 'text-wine'}`}>{label}</span>
        {hint && <span className={`text-[13px] ${emphasis ? 'text-paper/85' : 'text-muted'}`}>{hint}</span>}
      </div>
    </div>
  )
}
