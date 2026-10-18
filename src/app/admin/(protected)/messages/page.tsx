import { MessageSquareHeart } from 'lucide-react'
import type { Metadata } from 'next'
import { RsvpBadge } from '@/components/admin/ui/Badge'
import { PageHeader } from '@/components/admin/ui/PageHeader'
import { formatBoaVistaDateTime } from '@/components/admin/data-table/helpers'
import { requireAdmin } from '@/features/admin-auth/guard'
import { listGuests } from '@/features/guests/repo'

export const metadata: Metadata = { title: 'Recados | Painel' }

const VERB = { yes: 'Confirmou', no: 'Recusou', pending: 'Pendente' } as const

export default async function MessagesPage() {
  await requireAdmin()
  const messages = (await listGuests())
    .filter((g) => g.message)
    .sort((a, b) => (b.respondedAt?.getTime() ?? 0) - (a.respondedAt?.getTime() ?? 0))

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Recados"
        description="O que os convidados escreveram para a Isabella ao responder o convite."
      />
      {messages.length === 0 ? (
        <div className="flex flex-col items-center gap-4 border border-dashed border-hairline-strong bg-paper px-6 py-16 text-center">
          <span
            aria-hidden="true"
            className="grid size-14 place-items-center rounded-full bg-blush text-seal"
          >
            <MessageSquareHeart className="size-6" strokeWidth={1.5} />
          </span>
          <p className="text-lg font-medium">Nenhum recado ainda</p>
          <p className="max-w-[44ch] text-[15px] text-muted">
            Os recados aparecem aqui quando os convidados confirmam ou recusam pelo convite.
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {messages.map((g) => (
            <li key={g.id} className="flex flex-col gap-3 border border-hairline bg-paper p-5 shadow-paper">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
                <strong className="text-[15px] font-medium">{g.name}</strong>
                <RsvpBadge status={g.rsvpStatus} label={VERB[g.rsvpStatus]} />
                {g.respondedAt && (
                  <time dateTime={g.respondedAt.toISOString()} className="ml-auto text-muted">
                    {formatBoaVistaDateTime(g.respondedAt.toISOString())}
                  </time>
                )}
              </div>
              <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{g.message}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
