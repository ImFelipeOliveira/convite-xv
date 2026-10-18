import type { ReactNode } from 'react'
import { fieldErrorClass, helperClass, labelClass, requiredMark } from '../styles'

/** Ids the control must use: `id`, and `aria-describedby={fieldDescribedBy(id, …)}`. */
export const helpId = (id: string) => `${id}-help`
export const errorId = (id: string) => `${id}-error`

export function fieldDescribedBy(id: string, hasHelper: boolean): string {
  return hasHelper ? `${helpId(id)} ${errorId(id)}` : errorId(id)
}

/**
 * Label (text + required marker only, so the control's accessible name stays clean),
 * the control, then helper text and the inline error as siblings referenced by aria-describedby.
 */
export function Field({
  id,
  label,
  required,
  helper,
  error,
  children,
}: {
  id: string
  label: string
  required?: boolean
  helper?: ReactNode
  error?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={labelClass}>
        <span>
          {label}
          {required ? (
            <span aria-hidden="true" className={`${requiredMark} ml-0.5`}>
              *
            </span>
          ) : (
            <span aria-hidden="true" className="ml-1.5 font-normal text-muted">
              (opcional)
            </span>
          )}
        </span>
      </label>
      {children}
      {helper && (
        <p id={helpId(id)} className={helperClass}>
          {helper}
        </p>
      )}
      <p id={errorId(id)} className={fieldErrorClass}>
        {error}
      </p>
    </div>
  )
}
