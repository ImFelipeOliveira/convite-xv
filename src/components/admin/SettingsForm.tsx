'use client'

import { useActionState, useEffect } from 'react'
import { saveSettingsAction, type SettingsFormState } from '@/features/settings/actions'
import { inputClass } from './styles'
import { Button } from './ui/Button'
import { describedBy, Field } from './ui/Field'
import { useToast } from './ui/Toast'

type Values = {
  rsvpDeadline: string
  contactInfo: string
  closingMessage: string
  whatsappInviteTemplate: string
}

type Props = { initial: Values }

function Section({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section className="grid gap-5 border-b border-hairline py-8 first:pt-2 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-10">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-medium text-wine">{title}</h2>
        <p className="text-sm leading-relaxed text-muted">{description}</p>
      </div>
      <div className="flex max-w-2xl flex-col gap-5">{children}</div>
    </section>
  )
}

export function SettingsForm({ initial }: Props) {
  const [state, action, pending] = useActionState<SettingsFormState, FormData>(saveSettingsAction, null)
  const toast = useToast()

  useEffect(() => {
    if (!state) return
    if (state.ok) toast.success(state.message)
    else toast.error('Revise os campos destacados.')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const failed = state && !state.ok ? state : null
  const values = failed?.values ?? initial
  const errors = failed?.fieldErrors ?? {}
  const a11y = (key: keyof Values, help = false) => ({
    'aria-invalid': !!errors[key],
    'aria-describedby': describedBy(help && `settings-${key}-help`, `settings-${key}-error`),
  })

  return (
    <form action={action} aria-label="Configurações" className="flex flex-col">
      <fieldset disabled={pending} className="min-w-0">
        <Section
          title="Confirmação de presença"
          description="Até quando os convidados podem responder pelo convite."
        >
          <Field
            label="Prazo para confirmar"
            required
            errorId="settings-rsvpDeadline-error"
            error={errors.rsvpDeadline}
            helper="Data limite, no máximo 26/12/2026 (véspera da festa)."
            helperId="settings-rsvpDeadline-help"
          >
            <input
              name="rsvpDeadline"
              type="date"
              required
              max="2026-12-26"
              defaultValue={values.rsvpDeadline}
              {...a11y('rsvpDeadline', true)}
              className={`${inputClass} max-w-56`}
            />
          </Field>
          <Field
            label="Contato para dúvidas"
            errorId="settings-contactInfo-error"
            error={errors.contactInfo}
            helper="Aparece no convite, por exemplo: “Fale com a Ana: (95) 99123-4567”."
            helperId="settings-contactInfo-help"
          >
            <input
              name="contactInfo"
              maxLength={200}
              defaultValue={values.contactInfo}
              {...a11y('contactInfo', true)}
              className={inputClass}
            />
          </Field>
        </Section>
        <Section title="Textos" description="Mensagens que os convidados leem no convite e no WhatsApp.">
          <Field
            label="Mensagem final do convite"
            errorId="settings-closingMessage-error"
            error={errors.closingMessage}
            helper="Até 600 caracteres."
            helperId="settings-closingMessage-help"
          >
            <textarea
              name="closingMessage"
              rows={3}
              maxLength={600}
              defaultValue={values.closingMessage}
              {...a11y('closingMessage', true)}
              className={`${inputClass} resize-y leading-relaxed`}
            />
          </Field>
          <Field
            label="Mensagem do WhatsApp"
            required
            errorId="settings-whatsappInviteTemplate-error"
            error={errors.whatsappInviteTemplate}
            helperId="settings-whatsappInviteTemplate-help"
            helper={
              <>
                Use <code>{'{nome}'}</code> para o primeiro nome e <code>{'{link}'}</code> onde o link do
                convite deve aparecer.
              </>
            }
          >
            <textarea
              name="whatsappInviteTemplate"
              rows={4}
              maxLength={600}
              required
              defaultValue={values.whatsappInviteTemplate}
              {...a11y('whatsappInviteTemplate', true)}
              className={`${inputClass} resize-y leading-relaxed`}
            />
          </Field>
        </Section>
      </fieldset>
      <div className="sticky bottom-0 -mx-4 flex justify-end border-t border-hairline bg-paper/95 px-4 py-4 backdrop-blur-sm sm:mx-0 sm:px-0">
        <Button type="submit" pending={pending} pendingLabel="Salvando…">
          Salvar
        </Button>
      </div>
    </form>
  )
}
