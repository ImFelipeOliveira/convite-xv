import type { ReactNode } from 'react'
import { fieldErrorClass, helperClass, labelClass, requiredMark } from '../styles'

/** Label + control + helper text + inline error, wired with aria-describedby by the caller ids. */
export function Field({
  label,
  required,
  helper,
  helperId,
  error,
  errorId,
  children,
}: {
  label: string
  required?: boolean
  helper?: ReactNode
  helperId?: string
  error?: string
  errorId: string
  children: ReactNode
}) {
  return (
    <label className={labelClass}>
      <span>
        {label}
        {required ? (
          <span aria-hidden="true" className={`${requiredMark} ml-0.5`}>
            *
          </span>
        ) : (
          <span className="ml-1.5 font-normal text-muted">(opcional)</span>
        )}
      </span>
      {children}
      {helper && (
        <span id={helperId} className={helperClass}>
          {helper}
        </span>
      )}
      <span id={errorId} className={fieldErrorClass}>
        {error}
      </span>
    </label>
  )
}

export function describedBy(...ids: Array<string | false | undefined>): string | undefined {
  const list = ids.filter(Boolean)
  return list.length ? list.join(' ') : undefined
}
