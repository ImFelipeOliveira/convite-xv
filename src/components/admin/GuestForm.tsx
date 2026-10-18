'use client'

import { useActionState } from 'react'
import { saveGuestAction, type GuestFormState } from '@/features/guests/actions'
import { inputClass, primaryButtonClass } from './styles'

type Props = {
  /** Present when editing; absent for a new guest. */
  guest?: { id: string; name: string; phone: string; plusOnesLimit: number }
}

export function GuestForm({ guest }: Props) {
  const [state, action, pending] = useActionState<GuestFormState, FormData>(saveGuestAction, null)
  const failed = state && !state.ok ? state : null
  const values = failed?.values ?? {
    name: guest?.name ?? '',
    phone: guest?.phone ?? '',
    plusOnesLimit: String(guest?.plusOnesLimit ?? 0),
  }
  const fieldError = (key: 'name' | 'phone' | 'plusOnesLimit', id: string) =>
    failed?.fieldErrors?.[key] ? (
      <span id={id} className="text-sm text-error">
        {failed.fieldErrors[key]}
      </span>
    ) : null
  const prefix = guest ? `edit-${guest.id}` : 'new'

  return (
    <form
      action={action}
      aria-label={guest ? 'Editar convidado' : 'Novo convidado'}
      className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
    >
      {guest && <input type="hidden" name="id" value={guest.id} />}
      <label className="flex flex-1 flex-col gap-1 text-sm sm:min-w-56">
        Nome
        <input
          name="name"
          required
          maxLength={120}
          defaultValue={values.name}
          aria-invalid={!!failed?.fieldErrors?.name}
          aria-describedby={`${prefix}-name-error`}
          className={inputClass}
        />
        {fieldError('name', `${prefix}-name-error`)}
      </label>
      <label className="flex flex-col gap-1 text-sm sm:w-48">
        Telefone (opcional)
        <input
          name="phone"
          type="tel"
          inputMode="tel"
          placeholder="(95) 99123-4567"
          defaultValue={values.phone}
          aria-invalid={!!failed?.fieldErrors?.phone}
          aria-describedby={`${prefix}-phone-error`}
          className={inputClass}
        />
        {fieldError('phone', `${prefix}-phone-error`)}
      </label>
      <label className="flex flex-col gap-1 text-sm sm:w-48">
        Limite de acompanhantes
        <input
          name="plusOnesLimit"
          type="number"
          min={0}
          max={6}
          step={1}
          required
          defaultValue={values.plusOnesLimit}
          aria-invalid={!!failed?.fieldErrors?.plusOnesLimit}
          aria-describedby={`${prefix}-limit-error`}
          className={inputClass}
        />
        {fieldError('plusOnesLimit', `${prefix}-limit-error`)}
      </label>
      <button type="submit" disabled={pending} className={primaryButtonClass}>
        {guest ? 'Salvar' : 'Adicionar convidado'}
      </button>
      <p role="status" className="w-full text-sm">
        {failed?.error && <span className="text-error">{failed.error}</span>}
        {state?.ok && <span className="text-sage">{state.message}</span>}
      </p>
    </form>
  )
}
