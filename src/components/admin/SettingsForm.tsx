'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { saveSettingsAction, type SettingsFormState } from '@/features/settings/actions'
import { PIX_THANKS_MESSAGE_DEFAULT } from '@/features/pix/defaults'
import { MusicField } from './MusicField'
import { useSkewSafeForm } from './skew-recovery'
import { inputClass } from './styles'
import { Button } from './ui/Button'
import { Field, fieldDescribedBy } from './ui/Field'
import { useToast } from './ui/Toast'

type Values = {
  rsvpDeadline: string
  contactInfo: string
  closingMessage: string
  whatsappInviteTemplate: string
  reminderD7Text: string
  reminderD1Text: string
  rsvpPreferredDate: string
  rsvpNudgeText: string
  rsvpFinalText: string
  giftListText: string
  giftNudgeText: string
  pixThanksMessage: string
  pixReceiverName: string
  musicKey: string
  musicStartSeconds: string
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
  const { action: safeAction, formRef } = useSkewSafeForm(saveSettingsAction, 'settings')
  const [state, action, pending] = useActionState<SettingsFormState, FormData>(safeAction, null)
  const toast = useToast()
  const [musicUploading, setMusicUploading] = useState(false)

  useEffect(() => {
    if (!state) return
    if (state.ok) toast.success(state.message)
    else toast.error('Revise os campos destacados.')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const failed = state && !state.ok ? state : null
  const values = failed?.values ?? initial
  const errors = failed?.fieldErrors ?? {}
  // live "{nome} · Asaas" preview while the admin types (the input itself stays uncontrolled)
  const receiverRef = useRef<HTMLInputElement>(null)
  const [receiverPreview, setReceiverPreview] = useState(values.pixReceiverName)

  // Keep the preview in step with the input when its value changes without a keystroke: React resets the
  // form after every action (a failed save re-renders it with the submitted/server values), and a draft
  // restored after a version-skew reload is written straight into the DOM. Reads the input after the reset.
  useEffect(() => {
    const form = formRef.current
    if (!form) return
    const sync = () => {
      if (receiverRef.current) setReceiverPreview(receiverRef.current.value)
    }
    // the reset event fires before the values change; the second pass runs after a blocked-reload refill
    // (useSkewSafeForm re-applies the draft in its own reset handler, also on a 0 ms timeout)
    const syncAfterReset = () =>
      setTimeout(() => {
        sync()
        setTimeout(sync, 0)
      }, 0)
    sync() // a draft restored on mount (useSkewSafeForm's effect runs first)
    form.addEventListener('reset', syncAfterReset)
    return () => form.removeEventListener('reset', syncAfterReset)
  }, [formRef])

  // a new action result (failed save → values from the server) also lands in the uncontrolled input
  useEffect(() => {
    const id = setTimeout(() => {
      if (receiverRef.current) setReceiverPreview(receiverRef.current.value)
    }, 0)
    return () => clearTimeout(id)
  }, [state])
  const a11y = (key: keyof Values) => ({
    id: `settings-${key}`,
    'aria-invalid': !!errors[key],
    'aria-describedby': fieldDescribedBy(`settings-${key}`, true),
  })

  return (
    <form ref={formRef} action={action} aria-label="Configurações" className="flex flex-col">
      <fieldset disabled={pending} className="min-w-0">
        <Section
          title="Confirmação de presença"
          description="Até quando os convidados podem responder pelo convite."
        >
          <Field
            id="settings-rsvpDeadline"
            label="Prazo para confirmar"
            required
            error={errors.rsvpDeadline}
            helper="Data limite, no máximo 26/12/2026 (véspera da festa)."
          >
            <input
              name="rsvpDeadline"
              type="date"
              required
              max="2026-12-26"
              defaultValue={values.rsvpDeadline}
              {...a11y('rsvpDeadline')}
              className={`${inputClass} max-w-56`}
            />
          </Field>
          <Field
            id="settings-rsvpPreferredDate"
            label="Confirmar de preferência até"
            error={errors.rsvpPreferredDate}
            helper="Opcional. Data sugerida no convite e no lembrete de confirmação; até o prazo para confirmar."
          >
            <input
              name="rsvpPreferredDate"
              type="date"
              max="2026-12-26"
              defaultValue={values.rsvpPreferredDate}
              {...a11y('rsvpPreferredDate')}
              className={`${inputClass} max-w-56`}
            />
          </Field>
          <Field
            id="settings-contactInfo"
            label="Contato para dúvidas"
            error={errors.contactInfo}
            helper="Aparece no convite, por exemplo: “Fale com a Ana: (95) 99123-4567”."
          >
            <input
              name="contactInfo"
              maxLength={200}
              defaultValue={values.contactInfo}
              {...a11y('contactInfo')}
              className={inputClass}
            />
          </Field>
        </Section>
        <Section title="Textos" description="Mensagens que os convidados leem no convite e no WhatsApp.">
          <Field
            id="settings-closingMessage"
            label="Mensagem final do convite"
            error={errors.closingMessage}
            helper="Até 600 caracteres."
          >
            <textarea
              name="closingMessage"
              rows={3}
              maxLength={600}
              defaultValue={values.closingMessage}
              {...a11y('closingMessage')}
              className={`${inputClass} resize-y leading-relaxed`}
            />
          </Field>
          <Field
            id="settings-whatsappInviteTemplate"
            label="Mensagem do WhatsApp"
            required
            error={errors.whatsappInviteTemplate}
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
              {...a11y('whatsappInviteTemplate')}
              className={`${inputClass} resize-y leading-relaxed`}
            />
          </Field>
        </Section>
        <Section
          title="Lembretes automáticos"
          description="Enviados pelo WhatsApp a quem confirmou presença: 20/12 e 26/12, às 10h (horário de Boa Vista)."
        >
          <Field
            id="settings-reminderD7Text"
            label="Lembrete 7 dias antes"
            required
            error={errors.reminderD7Text}
            helper={
              <>
                Sai no domingo, 20/12, às 10h. Use <code>{'{nome}'}</code> e <code>{'{link}'}</code>; até 600
                caracteres.
              </>
            }
          >
            <textarea
              name="reminderD7Text"
              rows={4}
              maxLength={600}
              required
              defaultValue={values.reminderD7Text}
              {...a11y('reminderD7Text')}
              className={`${inputClass} resize-y leading-relaxed`}
            />
          </Field>
          <Field
            id="settings-reminderD1Text"
            label="Lembrete na véspera"
            required
            error={errors.reminderD1Text}
            helper={
              <>
                Sai no sábado, 26/12, às 10h. Use <code>{'{nome}'}</code> e <code>{'{link}'}</code>; até 600
                caracteres.
              </>
            }
          >
            <textarea
              name="reminderD1Text"
              rows={4}
              maxLength={600}
              required
              defaultValue={values.reminderD1Text}
              {...a11y('reminderD1Text')}
              className={`${inputClass} resize-y leading-relaxed`}
            />
          </Field>
        </Section>
        <Section
          title="Lembretes de confirmação"
          description="Enviados pelo WhatsApp a quem recebeu o convite e ainda não respondeu: 5 dias depois do convite e em 10/12, às 10h (horário de Boa Vista). Mudanças nas datas de confirmação valem para os convites enviados a partir de agora."
        >
          <Field
            id="settings-rsvpNudgeText"
            label="Lembrete de confirmação"
            required
            error={errors.rsvpNudgeText}
            helper={
              <>
                Sai 5 dias depois do convite. Use <code>{'{nome}'}</code>, <code>{'{preferencia}'}</code> (data de
                preferência) e <code>{'{link}'}</code>; até 600 caracteres.
              </>
            }
          >
            <textarea
              name="rsvpNudgeText"
              rows={4}
              maxLength={600}
              required
              defaultValue={values.rsvpNudgeText}
              {...a11y('rsvpNudgeText')}
              className={`${inputClass} resize-y leading-relaxed`}
            />
          </Field>
          <Field
            id="settings-rsvpFinalText"
            label="Aviso final de confirmação"
            required
            error={errors.rsvpFinalText}
            helper={
              <>
                Sai na quinta, 10/12, às 10h. Use <code>{'{nome}'}</code>, <code>{'{prazo}'}</code> (prazo para
                confirmar) e <code>{'{link}'}</code>; até 600 caracteres.
              </>
            }
          >
            <textarea
              name="rsvpFinalText"
              rows={4}
              maxLength={600}
              required
              defaultValue={values.rsvpFinalText}
              {...a11y('rsvpFinalText')}
              className={`${inputClass} resize-y leading-relaxed`}
            />
          </Field>
        </Section>
        <Section
          title="Presentes"
          description="Enviadas pelo WhatsApp a quem confirmou presença e ainda não escolheu presente nem fez Pix, só com a lista de presentes ativa e até 20/12, às 10h. O link leva direto à lista de presentes do convite."
        >
          <Field
            id="settings-giftListText"
            label="Mensagem com a lista de presentes"
            required
            error={errors.giftListText}
            helper={
              <>
                Sai logo depois da confirmação (entre 9h e 20h, horário de Boa Vista). Use <code>{'{nome}'}</code> e{' '}
                <code>{'{link}'}</code>; até 600 caracteres.
              </>
            }
          >
            <textarea
              name="giftListText"
              rows={4}
              maxLength={600}
              required
              defaultValue={values.giftListText}
              {...a11y('giftListText')}
              className={`${inputClass} resize-y leading-relaxed`}
            />
          </Field>
          <Field
            id="settings-giftNudgeText"
            label="Lembrete de presente"
            required
            error={errors.giftNudgeText}
            helper={
              <>
                Sai 5 dias depois da confirmação. Use <code>{'{nome}'}</code> e <code>{'{link}'}</code>; até 600
                caracteres.
              </>
            }
          >
            <textarea
              name="giftNudgeText"
              rows={4}
              maxLength={600}
              required
              defaultValue={values.giftNudgeText}
              {...a11y('giftNudgeText')}
              className={`${inputClass} resize-y leading-relaxed`}
            />
          </Field>
        </Section>
        <Section
          title="Pix"
          description="Presente em Pix pelo convite (Asaas). O nome aparece embaixo do QR Code, para o convidado conferir com o que o banco mostra."
        >
          <Field
            id="settings-pixReceiverName"
            label="Nome de quem recebe"
            required
            error={errors.pixReceiverName}
            helper={<>Aparece como “{receiverPreview.trim() || 'Nome'} · Asaas”. Use o nome do titular da conta Asaas; até 80 caracteres.</>}
          >
            <input
              name="pixReceiverName"
              maxLength={80}
              required
              ref={receiverRef}
              defaultValue={values.pixReceiverName}
              onChange={(e) => setReceiverPreview(e.target.value)}
              {...a11y('pixReceiverName')}
              className={inputClass}
            />
          </Field>
          <Field
            id="settings-pixThanksMessage"
            label="Mensagem de agradecimento do Pix"
            error={errors.pixThanksMessage}
            helper={<>Aparece quando o Pix é confirmado. Em branco: “{PIX_THANKS_MESSAGE_DEFAULT}” Até 400 caracteres.</>}
          >
            <textarea
              name="pixThanksMessage"
              rows={3}
              maxLength={400}
              defaultValue={values.pixThanksMessage}
              {...a11y('pixThanksMessage')}
              className={`${inputClass} resize-y leading-relaxed`}
            />
          </Field>
        </Section>
        <Section
          title="Música do convite"
          description="Toca baixinho, em repetição, quando o convidado abre o envelope. O convidado pode pausar a qualquer momento pelo botão no canto da tela."
        >
          <MusicField
            savedKey={initial.musicKey}
            initialKey={values.musicKey}
            startSeconds={values.musicStartSeconds}
            keyError={errors.musicKey}
            startError={errors.musicStartSeconds}
            onUploadingChange={setMusicUploading}
          />
        </Section>
      </fieldset>
      <div className="sticky bottom-0 -mx-4 flex justify-start border-t border-hairline bg-paper/95 px-4 py-4 backdrop-blur-sm sm:mx-0 sm:px-0">
        <Button type="submit" pending={pending} pendingLabel="Salvando…" disabled={musicUploading}>
          Salvar
        </Button>
      </div>
    </form>
  )
}
