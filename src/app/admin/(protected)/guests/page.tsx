import type { Metadata } from 'next'
import { GuestForm } from '@/components/admin/GuestForm'
import { GuestImportForm } from '@/components/admin/GuestImportForm'
import { GuestRowActions } from '@/components/admin/GuestRowActions'
import { inputClass, secondaryButtonClass } from '@/components/admin/styles'
import { requireAdmin } from '@/features/admin-auth/guard'
import { formatPhone } from '@/features/guests/phone'
import { listGuests } from '@/features/guests/repo'
import { inviteUrl, whatsappUrl } from '@/features/guests/whatsapp'
import { getSettings } from '@/features/settings/repo'
import type { Guest, RsvpStatus } from '@/server/db/schema'

export const metadata: Metadata = { title: 'Convidados | Painel' }

const STATUS_LABEL: Record<RsvpStatus, string> = { pending: 'Pendente', yes: 'Sim', no: 'Não' }

function parseStatus(v: string | string[] | undefined): RsvpStatus | undefined {
  return v === 'pending' || v === 'yes' || v === 'no' ? v : undefined
}

function people(g: Guest): string {
  if (g.rsvpStatus === 'yes') return String(1 + g.plusOnes)
  if (g.rsvpStatus === 'no') return '0'
  return '—'
}

export default async function GuestsPage({ searchParams }: PageProps<'/admin/guests'>) {
  await requireAdmin()
  const params = await searchParams
  const search = typeof params.q === 'string' ? params.q.trim() : ''
  const status = parseStatus(params.status)
  const [list, settings] = await Promise.all([
    listGuests({ status, search: search || undefined }),
    getSettings(),
  ])

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-medium">Convidados</h1>
        <a href="/admin/guests/export" download className={secondaryButtonClass}>
          Exportar CSV
        </a>
      </div>

      <section aria-labelledby="new-guest-title" className="flex flex-col gap-3">
        <h2 id="new-guest-title" className="text-lg font-medium">
          Novo convidado
        </h2>
        <GuestForm />
      </section>

      <section aria-labelledby="import-title" className="flex flex-col gap-3">
        <h2 id="import-title" className="text-lg font-medium">
          Importar planilha
        </h2>
        <GuestImportForm />
      </section>

      <section aria-labelledby="list-title" className="flex flex-col gap-3">
        <h2 id="list-title" className="text-lg font-medium">
          Lista ({list.length})
        </h2>
        <form method="get" action="/admin/guests" className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            Buscar
            <input name="q" type="search" defaultValue={search} placeholder="Nome" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-sm sm:w-48">
            Resposta
            <select name="status" defaultValue={status ?? ''} className={inputClass}>
              <option value="">Todas</option>
              <option value="pending">Pendente</option>
              <option value="yes">Sim</option>
              <option value="no">Não</option>
            </select>
          </label>
          <button type="submit" className={secondaryButtonClass}>
            Filtrar
          </button>
        </form>

        {list.length === 0 ? (
          <p className="text-sm">Nenhum convidado encontrado.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-petal bg-white">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <thead className="bg-blush">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Nome</th>
                  <th scope="col" className="px-3 py-2 font-medium">Telefone</th>
                  <th scope="col" className="px-3 py-2 font-medium">Limite</th>
                  <th scope="col" className="px-3 py-2 font-medium">Resposta</th>
                  <th scope="col" className="px-3 py-2 font-medium">Pessoas</th>
                  <th scope="col" className="px-3 py-2 font-medium">Aberto?</th>
                  <th scope="col" className="px-3 py-2 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {list.map((g) => (
                  <tr key={g.id} className="border-t border-petal align-top">
                    <td className="px-3 py-2">{g.name}</td>
                    <td className="whitespace-nowrap px-3 py-2">{g.phone ? formatPhone(g.phone) : '—'}</td>
                    <td className="px-3 py-2">{g.plusOnesLimit}</td>
                    <td className="px-3 py-2">{STATUS_LABEL[g.rsvpStatus]}</td>
                    <td className="px-3 py-2">{people(g)}</td>
                    <td className="px-3 py-2">{g.openedAt ? 'Sim' : 'Não'}</td>
                    <td className="px-3 py-2">
                      <GuestRowActions
                        id={g.id}
                        name={g.name}
                        inviteUrl={inviteUrl(g.token)}
                        whatsappUrl={whatsappUrl(g, settings.whatsappInviteTemplate)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
