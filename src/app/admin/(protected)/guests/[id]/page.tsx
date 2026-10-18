import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { z } from 'zod'
import { GuestForm } from '@/components/admin/GuestForm'
import { buttonClass } from '@/components/admin/styles'
import { PageHeader } from '@/components/admin/ui/PageHeader'
import { requireAdmin } from '@/features/admin-auth/guard'
import { formatPhone } from '@/features/guests/phone'
import { findGuestById } from '@/features/guests/repo'

export const metadata: Metadata = { title: 'Editar convidado | Painel' }

// Deep-link fallback; the list edits in a side sheet.
export default async function EditGuestPage({ params }: PageProps<'/admin/guests/[id]'>) {
  await requireAdmin()
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const guest = await findGuestById(id)
  if (!guest) notFound()

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/guests" className={`${buttonClass('ghost', 'sm')} -ml-2 self-start`}>
        <ArrowLeft aria-hidden="true" className="size-4" />
        Voltar para convidados
      </Link>
      <PageHeader title="Editar convidado" description={guest.name} />
      <div className="max-w-xl">
        <GuestForm
          guest={{
            id: guest.id,
            name: guest.name,
            phone: guest.phone ? formatPhone(guest.phone) : '',
            plusOnesLimit: guest.plusOnesLimit,
          }}
          redirectTo="/admin/guests"
        />
      </div>
    </div>
  )
}
