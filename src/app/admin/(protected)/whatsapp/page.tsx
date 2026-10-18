import { MessageCircle } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { buttonClass } from '@/components/admin/styles'
import { PageHeader } from '@/components/admin/ui/PageHeader'
import { requireAdmin } from '@/features/admin-auth/guard'

export const metadata: Metadata = { title: 'WhatsApp | Painel' }

// Placeholder until the WhatsApp (Evolution API) screen lands.
export default async function WhatsappPage() {
  await requireAdmin()
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="WhatsApp" description="Envio dos convites e lembretes pelo número da família." />
      <div className="flex flex-col items-center gap-4 border border-dashed border-hairline-strong bg-paper px-6 py-16 text-center">
        <span aria-hidden="true" className="grid size-14 place-items-center rounded-full bg-blush text-seal">
          <MessageCircle className="size-6" strokeWidth={1.5} />
        </span>
        <p className="text-lg font-medium">Em preparação</p>
        <p className="max-w-[46ch] text-[15px] text-muted">
          Enquanto isso, envie cada convite pelo botão de WhatsApp na lista de convidados.
        </p>
        <Link href="/admin/guests" className={buttonClass('secondary')}>
          Ir para convidados
        </Link>
      </div>
    </div>
  )
}
