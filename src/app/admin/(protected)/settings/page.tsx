import type { Metadata } from 'next'
import { SettingsForm } from '@/components/admin/SettingsForm'
import { requireAdmin } from '@/features/admin-auth/guard'
import { getSettings } from '@/features/settings/repo'

export const metadata: Metadata = { title: 'Configurações | Painel' }

export default async function SettingsPage() {
  await requireAdmin()
  const s = await getSettings()
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-medium">Configurações</h1>
      <SettingsForm
        initial={{
          rsvpDeadline: s.rsvpDeadline,
          contactInfo: s.contactInfo ?? '',
          closingMessage: s.closingMessage ?? '',
          whatsappInviteTemplate: s.whatsappInviteTemplate,
        }}
      />
    </div>
  )
}
