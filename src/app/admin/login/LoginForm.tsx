'use client'

import { CircleAlert, Eye, EyeOff } from 'lucide-react'
import { useActionState, useRef, useState } from 'react'
import { focusRing, inputClass, labelClass } from '@/components/admin/styles'
import { Button } from '@/components/admin/ui/Button'
import { signIn, type SignInState } from '@/features/admin-auth/actions'

export function LoginForm() {
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, null)
  const [showPassword, setShowPassword] = useState(false)
  const passwordRef = useRef<HTMLInputElement>(null)

  function togglePassword() {
    const input = passwordRef.current
    const focused = document.activeElement === input
    const start = input?.selectionStart ?? null
    const end = input?.selectionEnd ?? null
    setShowPassword((v) => !v)
    // keep focus and caret where they were (the type swap resets the selection)
    requestAnimationFrame(() => {
      if (!input || !focused) return
      input.focus()
      if (start !== null && end !== null) input.setSelectionRange(start, end)
    })
  }
  return (
    <form action={action} aria-label="Entrar no painel" className="flex w-full flex-col gap-5">
      <fieldset disabled={pending} className="flex min-w-0 flex-col gap-4">
        <label className={labelClass}>
          E-mail
          <input
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            required
            autoFocus
            className={inputClass}
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="login-password" className={labelClass}>
            Senha
          </label>
          <div className="relative">
            <input
              ref={passwordRef}
              id="login-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              autoCapitalize="none"
              spellCheck={false}
              required
              className={`${inputClass} pr-12`}
            />
            <button
              type="button"
              onClick={togglePassword}
              // don't steal focus from the field on mouse/touch
              onMouseDown={(e) => e.preventDefault()}
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              aria-pressed={showPassword}
              aria-controls="login-password"
              className={`absolute top-1/2 right-0.5 grid size-11 -translate-y-1/2 place-items-center rounded-full text-muted transition-colors duration-(--dur-micro) ease-(--ease-letter) hover:bg-blush hover:text-wine active:bg-petal/60 disabled:opacity-55 ${focusRing}`}
            >
              {showPassword ? (
                <EyeOff aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />
              ) : (
                <Eye aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />
              )}
            </button>
          </div>
        </div>
      </fieldset>
      {state?.error && (
        <p
          role="alert"
          className="flex items-start gap-2 border border-error/30 bg-blush/50 px-3 py-2.5 text-sm text-error"
        >
          <CircleAlert aria-hidden="true" className="mt-px size-4 shrink-0" strokeWidth={1.75} />
          {state.error}
        </p>
      )}
      <Button type="submit" pending={pending} pendingLabel="Entrando…" className="w-full">
        Entrar
      </Button>
    </form>
  )
}
