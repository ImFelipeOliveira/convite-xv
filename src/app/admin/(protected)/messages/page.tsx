import type { Metadata } from 'next'
import { requireAdmin } from '@/features/admin-auth/guard'
import { listGuests } from '@/features/guests/repo'
import { EVENT } from '@/features/event/event'

export const metadata: Metadata = { title: 'Recados | Painel' }

const dateFormat = new Intl.DateTimeFormat('pt-BR', {
  timeZone: EVENT.timeZone,
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

export default async function MessagesPage() {
  await requireAdmin()
  const messages = (await listGuests())
    .filter((g) => g.message)
    .sort((a, b) => (b.respondedAt?.getTime() ?? 0) - (a.respondedAt?.getTime() ?? 0))

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-medium">Recados</h1>
      {messages.length === 0 ? (
        <p className="text-sm">Nenhum recado ainda.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {messages.map((g) => (
            <li key={g.id} className="rounded-md border border-petal bg-white p-4">
              <p className="flex flex-wrap items-baseline gap-x-3 text-sm">
                <strong className="font-medium">{g.name}</strong>
                <span>{g.rsvpStatus === 'yes' ? 'Confirmou' : g.rsvpStatus === 'no' ? 'Recusou' : 'Pendente'}</span>
                {g.respondedAt && (
                  <time dateTime={g.respondedAt.toISOString()}>
                    {dateFormat.format(g.respondedAt).replace(', ', ' às ')}
                  </time>
                )}
              </p>
              <p className="mt-2 whitespace-pre-wrap">{g.message}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
