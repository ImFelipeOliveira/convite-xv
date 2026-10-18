import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { buttonClass, type ButtonSize, type ButtonVariant } from '../styles'

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block size-4 shrink-0 animate-[spin_.8s_linear_infinite] rounded-full border-2 border-current border-r-transparent ${className}`}
    />
  )
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  /** Shows a spinner + `pendingLabel` and disables the button, keeping its width. */
  pending?: boolean
  pendingLabel?: string
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  pending = false,
  pendingLabel,
  disabled,
  className = '',
  children,
  type = 'button',
  ...rest
}: Props) {
  const content = (
    <>
      {icon}
      {children}
    </>
  )
  return (
    <button
      type={type}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={`${buttonClass(variant, size)} ${className}`}
      {...rest}
    >
      {pendingLabel ? (
        // both labels share one grid cell, so the button keeps the width of the wider one
        <span className="grid place-items-center">
          <span
            className={`col-start-1 row-start-1 inline-flex items-center gap-2 ${pending ? 'invisible' : ''}`}
          >
            {content}
          </span>
          <span
            className={`col-start-1 row-start-1 inline-flex items-center gap-2 ${pending ? '' : 'invisible'}`}
          >
            <Spinner />
            {pendingLabel}
          </span>
        </span>
      ) : (
        content
      )}
    </button>
  )
}
