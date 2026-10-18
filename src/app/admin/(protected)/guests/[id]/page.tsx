import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { z } from 'zod'
import { GuestForm } from '@/components/admin/GuestForm'
import { requireAdmin } from '@/features/admin-auth/guard'
import { formatPhone } from '@/features/guests/phone'
import { findGuestById } from '@/features/guests/repo'

export const metadata: Metadata = { title: 'Editar convidado | Painel' }

export default async function EditGuestPage({ params }: PageProps<'/admin/guests/[id]'>) {
  await requireAdmin()
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const guest = await findGuestById(id)
  if (!guest) notFound()

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Link href="/admin/guests" className="inline-flex min-h-11 items-center text-sm underline">
        ← Voltar para convidados
      </Link>
      <h1 className="text-2xl font-medium">Editar convidado</h1>
      <GuestForm
        guest={{
          id: guest.id,
          name: guest.name,
          phone: guest.phone ? formatPhone(guest.phone) : '',
          plusOnesLimit: guest.plusOnesLimit,
        }}
      />
    </div>
  )
}
