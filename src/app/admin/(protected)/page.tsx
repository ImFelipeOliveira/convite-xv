import type { Metadata } from 'next'
import { requireAdmin } from '@/features/admin-auth/guard'
import { getSummary, listGuests } from '@/features/guests/repo'

export const metadata: Metadata = { title: 'Painel' }

export default async function AdminHomePage() {
  await requireAdmin()
  const [summary, guests] = await Promise.all([getSummary(), listGuests()])
  const openedPending = guests.filter((g) => g.openedAt && g.rsvpStatus === 'pending')
  const cards = [
    ['Convidados', summary.total],
    ['Confirmados', summary.yes],
    ['Recusados', summary.no],
    ['Pendentes', summary.pending],
    ['Pessoas confirmadas', summary.confirmedPeople],
  ] as const

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <h1 className="text-2xl font-medium">Painel</h1>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-md border border-petal bg-white p-4">
            <dt className="text-sm">{label}</dt>
            <dd className="text-3xl font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      <section aria-labelledby="opened-title" className="flex flex-col gap-3">
        <h2 id="opened-title" className="text-lg font-medium">
          Abriram e não responderam
        </h2>
        {openedPending.length === 0 ? (
          <p className="text-sm">Ninguém por aqui.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {openedPending.map((g) => (
              <li key={g.id}>{g.name}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
