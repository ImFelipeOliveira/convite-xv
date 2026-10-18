'use client'

import { useRouter } from 'next/navigation'
import { TriangleAlert } from 'lucide-react'
import { useActionState, useEffect, useRef, useState } from 'react'
import { saveGuestAction, type GuestFormState } from '@/features/guests/actions'
import { joinNames } from '@/features/guests/duplicates'
import { useSkewSafeForm } from './skew-recovery'
import { inputClass } from './styles'
import { Button } from './ui/Button'
import { Field, fieldDescribedBy } from './ui/Field'
import { useToast } from './ui/Toast'

type Props = {
  /** Present when editing; absent for a new guest. */
  guest?: { id: string; name: string; phone: string; plusOnesLimit: number }
  /** Called after the server confirmed the save (closes the sheet). */
  onSaved?: () => void
  /** Navigates here after a confirmed save (the stand-alone edit page). */
  redirectTo?: string
  onCancel?: () => void
}

export function GuestForm({ guest, onSaved, redirectTo, onCancel }: Props) {
  const draftKey = guest ? `guest:${guest.id}` : 'guest:new'
  const { action: safeAction, formRef } = useSkewSafeForm(saveGuestAction, draftKey)
  const [state, action, pending] = useActionState<GuestFormState, FormData>(safeAction, null)
  const toast = useToast()
  const router = useRouter()
  const phoneRef = useRef<HTMLInputElement>(null)
  const warningRef = useRef<HTMLDivElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  // the duplicate warning answers one submitted phone: editing the field dismisses it
  const [dismissed, setDismissed] = useState<GuestFormState>(null)

  useEffect(() => {
    if (!state) return
    if (!state.ok && state.duplicatePhone) {
      // not an error: the inline warning asks for a decision (focus moves there)
      warningRef.current?.focus()
    } else if (state.ok) {
      toast.success(state.message)
      onSaved?.()
      if (redirectTo) router.push(redirectTo)
    } else if (state.error) {
      toast.error(state.error)
    } else {
      toast.error('Revise os campos destacados.')
    }
    // only react to a new action result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const failed = state && !state.ok ? state : null
  const values = failed?.values ?? {
    name: guest?.name ?? '',
    phone: guest?.phone ?? '',
    plusOnesLimit: String(guest?.plusOnesLimit ?? 0),
  }
  const errors = failed?.fieldErrors ?? {}
  const prefix = guest ? `edit-${guest.id}` : 'new'
  const duplicate = failed?.duplicatePhone && dismissed !== state ? failed.duplicatePhone : null
  const duplicateId = `${prefix}-phone-duplicate`

  return (
    <form
      ref={formRef}
      action={action}
      aria-label={guest ? 'Editar convidado' : 'Novo convidado'}
      className="flex flex-col gap-6"
    >
      {guest && <input type="hidden" name="id" value={guest.id} />}
      <fieldset disabled={pending} className="flex min-w-0 flex-col gap-5">
        <Field
          id={`${prefix}-name`}
          label="Nome"
          required
          error={errors.name}
          helper="Como aparece no convite e na mensagem do WhatsApp."
        >
          <input
            name="name"
            required
            maxLength={120}
            autoComplete="off"
            autoFocus
            data-autofocus
            defaultValue={values.name}
            aria-invalid={!!errors.name}
            id={`${prefix}-name`}
            aria-describedby={fieldDescribedBy(`${prefix}-name`, true)}
            className={inputClass}
          />
        </Field>
        <Field
          id={`${prefix}-phone`}
          label="Telefone"
          error={errors.phone}
          helper="Celular com DDD, para enviar o convite pelo WhatsApp."
        >
          <input
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder="(95) 99123-4567"
            ref={phoneRef}
            defaultValue={values.phone}
            onChange={() => {
              if (duplicate) setDismissed(state)
            }}
            aria-invalid={!!errors.phone}
            id={`${prefix}-phone`}
            aria-describedby={`${fieldDescribedBy(`${prefix}-phone`, true)}${duplicate ? ` ${duplicateId}` : ''}`}
            className={inputClass}
          />
        </Field>
        {duplicate && (
          <div
            ref={warningRef}
            tabIndex={-1}
            role="group"
            aria-labelledby={duplicateId}
            className="-mt-2 flex flex-col gap-3 border border-gold/50 bg-gold-wash p-4 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine"
          >
            <p id={duplicateId} role="alert" className="flex gap-2 text-sm text-wine">
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-gold-text" strokeWidth={1.75} />
              <span>Este telefone já está cadastrado para {joinNames(duplicate.names)}.</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                // submits through the hidden confirm button at the end of the form, so Enter in a
                // field still means plain "Salvar" (the first submit button in tree order)
                onClick={() => formRef.current?.requestSubmit(confirmRef.current)}
                pending={pending}
                pendingLabel="Salvando…"
              >
                Salvar mesmo assim
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  setDismissed(state)
                  phoneRef.current?.focus()
                  phoneRef.current?.select()
                }}
              >
                Corrigir telefone
              </Button>
            </div>
          </div>
        )}
        <Field
          id={`${prefix}-limit`}
          label="Limite de acompanhantes"
          required
          error={errors.plusOnesLimit}
          helper="Quantas pessoas a mais o convidado pode levar (0 a 6)."
        >
          <input
            name="plusOnesLimit"
            type="number"
            inputMode="numeric"
            min={0}
            max={6}
            step={1}
            required
            defaultValue={values.plusOnesLimit}
            aria-invalid={!!errors.plusOnesLimit}
            id={`${prefix}-limit`}
            aria-describedby={fieldDescribedBy(`${prefix}-limit`, true)}
            className={`${inputClass} max-w-40 tabular-nums`}
          />
        </Field>
      </fieldset>
      <div className="flex flex-col-reverse gap-2 border-t border-hairline pt-5 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            Cancelar
          </Button>
        )}
        <Button type="submit" pending={pending} pendingLabel="Salvando…">
          Salvar
        </Button>
      </div>
      {duplicate && (
        <button ref={confirmRef} type="submit" name="confirmDuplicatePhone" value="1" hidden tabIndex={-1} />
      )}
    </form>
  )
}
