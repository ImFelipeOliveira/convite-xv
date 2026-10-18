import type { Metadata } from 'next'
import { GuestsTable, type GuestRow } from '@/components/admin/GuestsTable'
import { requireAdmin } from '@/features/admin-auth/guard'
import { formatPhone } from '@/features/guests/phone'
import { listGuests } from '@/features/guests/repo'
import { inviteUrl, whatsappUrl } from '@/features/guests/whatsapp'
import { getSettings } from '@/features/settings/repo'
import { lastInvitePerGuest } from '@/features/whatsapp/dispatches'
import type { Guest } from '@/server/db/schema'

export const metadata: Metadata = { title: 'Convidados | Painel' }

function people(g: Guest): number | null {
  if (g.rsvpStatus === 'yes') return 1 + g.plusOnes
  if (g.rsvpStatus === 'no') return 0
  return null
}

export default async function GuestsPage() {
  await requireAdmin()
  const [list, settings, invites] = await Promise.all([listGuests(), getSettings(), lastInvitePerGuest()])
  // minimized rows: only what the table shows or its actions need
  const rows: GuestRow[] = list.map((g) => {
    const invite = invites.get(g.id)
    // invites are only ever sending / sent / failed
    const last =
      invite && (invite.status === 'sending' || invite.status === 'sent' || invite.status === 'failed')
        ? { status: invite.status, at: invite.at.toISOString() }
        : null
    return {
      id: g.id,
      name: g.name,
      phone: g.phone ? formatPhone(g.phone) : '',
      plusOnesLimit: g.plusOnesLimit,
      rsvpStatus: g.rsvpStatus,
      people: people(g),
      openedAt: g.openedAt ? g.openedAt.toISOString() : null,
      inviteUrl: inviteUrl(g.token),
      whatsappUrl: whatsappUrl(g, settings.whatsappInviteTemplate),
      hasPhone: g.phone !== null && g.phone !== '',
      lastInvite: last,
      inviteStatus: last?.status ?? 'none',
    }
  })
  const confirmed = list.filter((g) => g.rsvpStatus === 'yes').length

  return (
    <div className="flex flex-col gap-8">
      <GuestsTable
        guests={rows}
        description={
          list.length === 0
            ? 'Cada convidado recebe um link pessoal para abrir o convite e confirmar presença.'
            : `${list.length} ${list.length === 1 ? 'convidado' : 'convidados'}, ${confirmed} ${confirmed === 1 ? 'confirmado' : 'confirmados'}.`
        }
      />
    </div>
  )
}
