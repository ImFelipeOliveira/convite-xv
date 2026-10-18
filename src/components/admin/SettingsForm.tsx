'use client'

import { useActionState } from 'react'
import { saveSettingsAction, type SettingsFormState } from '@/features/settings/actions'
import { inputClass, primaryButtonClass } from './styles'

type Props = {
  initial: {
    rsvpDeadline: string
    contactInfo: string
    closingMessage: string
    whatsappInviteTemplate: string
  }
}

export function SettingsForm({ initial }: Props) {
  const [state, action, pending] = useActionState<SettingsFormState, FormData>(saveSettingsAction, null)
  const failed = state && !state.ok ? state : null
  const values = failed?.values ?? initial
  const err = (key: keyof Props['initial']) =>
    failed?.fieldErrors[key] ? (
      <span id={`settings-${key}-error`} className="text-sm text-error">
        {failed.fieldErrors[key]}
      </span>
    ) : null
  const a11y = (key: keyof Props['initial']) => ({
    'aria-invalid': !!failed?.fieldErrors[key],
    'aria-describedby': `settings-${key}-error`,
  })

  return (
    <form action={action} aria-label="Configurações" className="flex max-w-2xl flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        Prazo para confirmar
        <input
          name="rsvpDeadline"
          type="date"
          required
          max="2026-12-26"
          defaultValue={values.rsvpDeadline}
          {...a11y('rsvpDeadline')}
          className={inputClass}
        />
        {err('rsvpDeadline')}
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Contato para dúvidas
        <input
          name="contactInfo"
          maxLength={200}
          defaultValue={values.contactInfo}
          {...a11y('contactInfo')}
          className={inputClass}
        />
        {err('contactInfo')}
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Mensagem final do convite
        <textarea
          name="closingMessage"
          rows={3}
          maxLength={600}
          defaultValue={values.closingMessage}
          {...a11y('closingMessage')}
          className={inputClass}
        />
        {err('closingMessage')}
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Mensagem do WhatsApp
        <textarea
          name="whatsappInviteTemplate"
          rows={4}
          maxLength={600}
          required
          defaultValue={values.whatsappInviteTemplate}
          {...a11y('whatsappInviteTemplate')}
          className={inputClass}
        />
        <span className="text-xs">Use {'{link}'} onde o link do convite deve aparecer.</span>
        {err('whatsappInviteTemplate')}
      </label>
      <button type="submit" disabled={pending} className={`${primaryButtonClass} self-start`}>
        Salvar
      </button>
      <p role="status" className="text-sm">
        {state?.ok && <span className="text-sage">{state.message}</span>}
      </p>
    </form>
  )
}
