import {
  CircleCheck,
  CircleHelp,
  CircleX,
  Eye,
  MessageSquareHeart,
  Send,
  Settings,
  UserPlus,
  Users,
} from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { focusRing } from '@/components/admin/styles'
import { PageHeader } from '@/components/admin/ui/PageHeader'
import { StatCard } from '@/components/admin/ui/StatCard'
import { requireAdmin } from '@/features/admin-auth/guard'
import { getSummary, listGuests } from '@/features/guests/repo'

export const metadata: Metadata = { title: 'Resumo | Painel' }

const icon = 'size-5'
const QUICK_LINKS = [
  { href: '/admin/guests', label: 'Adicionar ou importar convidados', icon: UserPlus },
  { href: '/admin/whatsapp', label: 'Enviar convites pelo WhatsApp', icon: Send },
  { href: '/admin/messages', label: 'Ler os recados', icon: MessageSquareHeart },
  { href: '/admin/settings', label: 'Ajustar prazo e mensagens', icon: Settings },
] as const

export default async function AdminHomePage() {
  await requireAdmin()
  const [summary, guests] = await Promise.all([getSummary(), listGuests()])
  const openedPending = guests.filter((g) => g.openedAt && g.rsvpStatus === 'pending')
  const answered = summary.yes + summary.no
  const percent = summary.total ? Math.round((summary.yes / summary.total) * 100) : 0

  return (
    <div className="flex flex-col gap-10">
      <PageHeader title="Resumo" description="Como estão as respostas ao convite dos 15 anos da Isabella." />

      <section
        aria-labelledby="progress-title"
        className="flex flex-col gap-3 border border-hairline bg-paper p-5 shadow-paper sm:p-6"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="progress-title" className="text-base font-medium">
            Confirmados {summary.yes} de {summary.total}
          </h2>
          <span className="text-sm text-muted tabular-nums">
            {answered} {answered === 1 ? 'resposta' : 'respostas'}, {percent}% confirmados
          </span>
        </div>
        <div
          role="progressbar"
          aria-label={`Confirmados ${summary.yes} de ${summary.total}`}
          aria-valuemin={0}
          aria-valuemax={Math.max(1, summary.total)}
          aria-valuenow={summary.yes}
          className="flex h-3 overflow-hidden rounded-full bg-blush"
        >
          <span
            className="h-full bg-sage transition-[width] duration-(--dur-reveal) ease-(--ease-letter)"
            style={{ width: `${percent}%` }}
          />
          <span
            className="h-full bg-deep-rose/45"
            style={{ width: `${summary.total ? (summary.no / summary.total) * 100 : 0}%` }}
          />
        </div>
        <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-muted">
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2 rounded-full bg-sage" />
            Sim
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2 rounded-full bg-deep-rose/45" />
            Não
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2 rounded-full bg-blush ring-1 ring-hairline" />
            Sem resposta
          </li>
        </ul>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <div className="col-span-2 lg:col-span-1">
          <StatCard
            emphasis
            icon={<Users className={icon} strokeWidth={1.75} />}
            value={summary.confirmedPeople}
            label="Pessoas confirmadas"
            hint="Convidados + acompanhantes"
          />
        </div>
        <StatCard
          icon={<Users className={icon} strokeWidth={1.75} />}
          value={summary.total}
          label="Convidados"
        />
        <StatCard
          icon={<CircleCheck className={icon} strokeWidth={1.75} />}
          value={summary.yes}
          label="Confirmados"
        />
        <StatCard
          icon={<CircleX className={icon} strokeWidth={1.75} />}
          value={summary.no}
          label="Recusados"
        />
        <StatCard
          icon={<CircleHelp className={icon} strokeWidth={1.75} />}
          value={summary.pending}
          label="Pendentes"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section
          aria-labelledby="opened-title"
          className="flex flex-col gap-4 border border-hairline bg-paper p-5 shadow-paper sm:p-6"
        >
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="grid size-10 shrink-0 place-items-center rounded-full bg-gold-wash text-gold-text"
            >
              <Eye className={icon} strokeWidth={1.75} />
            </span>
            <div className="flex flex-col gap-0.5">
              <h2 id="opened-title" className="text-base font-medium">
                Abriram e não responderam
              </h2>
              <p className="text-sm text-muted">Vale um lembrete carinhoso para quem já viu o convite.</p>
            </div>
          </div>
          {openedPending.length === 0 ? (
            <p className="border-t border-hairline pt-4 text-sm text-muted">
              Ninguém por aqui — quem abriu já respondeu.
            </p>
          ) : (
            <ul className="flex flex-col border-t border-hairline">
              {openedPending.map((g) => (
                <li
                  key={g.id}
                  className="flex min-h-12 items-center border-b border-hairline last:border-b-0"
                >
                  {g.name}
                </li>
              ))}
            </ul>
          )}
        </section>

        <nav aria-labelledby="quick-title" className="flex flex-col gap-3">
          <h2 id="quick-title" className="text-base font-medium">
            Atalhos
          </h2>
          <ul className="flex flex-col gap-2">
            {QUICK_LINKS.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  className={`group flex min-h-12 items-center gap-3 border border-hairline bg-paper px-4 py-3 text-[15px] transition-[background-color,border-color] duration-(--dur-micro) ease-(--ease-letter) hover:border-seal/60 hover:bg-blush/50 active:bg-blush ${focusRing}`}
                >
                  <Icon aria-hidden="true" className="size-[18px] text-seal" strokeWidth={1.75} />
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  )
}
