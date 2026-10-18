'use client'

import { useRouter } from 'next/navigation'
import { useActionState, useEffect } from 'react'
import { saveGuestAction, type GuestFormState } from '@/features/guests/actions'
import { inputClass } from './styles'
import { Button } from './ui/Button'
import { describedBy, Field } from './ui/Field'
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
  const [state, action, pending] = useActionState<GuestFormState, FormData>(saveGuestAction, null)
  const toast = useToast()
  const router = useRouter()

  useEffect(() => {
    if (!state) return
    if (state.ok) {
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

  return (
    <form
      action={action}
      aria-label={guest ? 'Editar convidado' : 'Novo convidado'}
      className="flex flex-col gap-6"
    >
      {guest && <input type="hidden" name="id" value={guest.id} />}
      <fieldset disabled={pending} className="flex min-w-0 flex-col gap-5">
        <Field
          label="Nome"
          required
          errorId={`${prefix}-name-error`}
          error={errors.name}
          helper="Como aparece no convite e na mensagem do WhatsApp."
          helperId={`${prefix}-name-help`}
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
            aria-describedby={describedBy(`${prefix}-name-help`, `${prefix}-name-error`)}
            className={inputClass}
          />
        </Field>
        <Field
          label="Telefone"
          errorId={`${prefix}-phone-error`}
          error={errors.phone}
          helper="Celular com DDD, para enviar o convite pelo WhatsApp."
          helperId={`${prefix}-phone-help`}
        >
          <input
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder="(95) 99123-4567"
            defaultValue={values.phone}
            aria-invalid={!!errors.phone}
            aria-describedby={describedBy(`${prefix}-phone-help`, `${prefix}-phone-error`)}
            className={inputClass}
          />
        </Field>
        <Field
          label="Limite de acompanhantes"
          required
          errorId={`${prefix}-limit-error`}
          error={errors.plusOnesLimit}
          helper="Quantas pessoas a mais o convidado pode levar (0 a 6)."
          helperId={`${prefix}-limit-help`}
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
            aria-describedby={describedBy(`${prefix}-limit-help`, `${prefix}-limit-error`)}
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
    </form>
  )
}
