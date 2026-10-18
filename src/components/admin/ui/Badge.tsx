import type { ReactNode } from 'react'

export type BadgeTone = 'gold' | 'sage' | 'rose' | 'neutral' | 'error'

const tones: Record<BadgeTone, string> = {
  gold: 'bg-gold-wash text-gold-text ring-gold/40',
  sage: 'bg-sage-wash text-sage ring-sage/30',
  rose: 'bg-blush text-deep-rose ring-deep-rose/25',
  neutral: 'bg-paper text-muted ring-hairline',
  error: 'bg-blush text-error ring-error/30',
}

export function Badge({ tone, icon, children }: { tone: BadgeTone; icon?: ReactNode; children: ReactNode }) {
  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[13px] font-medium ring-1 ring-inset ${tones[tone]}`}
    >
      {icon ?? <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

export type RsvpStatusValue = 'pending' | 'yes' | 'no'

export const RSVP_LABEL: Record<RsvpStatusValue, string> = { pending: 'Pendente', yes: 'Sim', no: 'Não' }
const RSVP_TONE: Record<RsvpStatusValue, BadgeTone> = { pending: 'gold', yes: 'sage', no: 'rose' }

export function RsvpBadge({ status, label }: { status: RsvpStatusValue; label?: string }) {
  return <Badge tone={RSVP_TONE[status]}>{label ?? RSVP_LABEL[status]}</Badge>
}
