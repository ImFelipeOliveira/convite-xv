import type { Metadata } from 'next'
import { SettingsForm } from '@/components/admin/SettingsForm'
import { PageHeader } from '@/components/admin/ui/PageHeader'
import { requireAdmin } from '@/features/admin-auth/guard'
import { getSettings } from '@/features/settings/repo'
import { PIX_RECEIVER_NAME_DEFAULT } from '@/features/pix/defaults'

export const metadata: Metadata = { title: 'Configurações | Painel' }

export default async function SettingsPage() {
  await requireAdmin()
  const s = await getSettings()
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Configurações"
        description="Prazo de resposta, textos do convite e do WhatsApp, e o Pix."
      />
      <SettingsForm
        initial={{
          rsvpDeadline: s.rsvpDeadline,
          contactInfo: s.contactInfo ?? '',
          closingMessage: s.closingMessage ?? '',
          whatsappInviteTemplate: s.whatsappInviteTemplate,
          reminderD7Text: s.reminderD7Text,
          reminderD1Text: s.reminderD1Text,
          rsvpPreferredDate: s.rsvpPreferredDate ?? '',
          rsvpNudgeText: s.rsvpNudgeText,
          rsvpFinalText: s.rsvpFinalText,
          giftListText: s.giftListText,
          giftNudgeText: s.giftNudgeText,
          pixThanksMessage: s.pixThanksMessage ?? '',
          pixReceiverName: s.pixReceiverName ?? PIX_RECEIVER_NAME_DEFAULT,
        }}
      />
    </div>
  )
}
