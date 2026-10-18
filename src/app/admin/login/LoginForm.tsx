'use client'

import { useActionState } from 'react'
import { signIn, type SignInState } from '@/features/admin-auth/actions'

const input =
  'w-full rounded-md border border-petal bg-white px-3 py-2 text-wine focus:outline-2 focus:outline-rose'

export function LoginForm() {
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, null)
  return (
    <form action={action} className="flex w-full max-w-sm flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        E-mail
        <input name="email" type="email" autoComplete="username" required className={input} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Senha
        <input name="password" type="password" autoComplete="current-password" required className={input} />
      </label>
      {state?.error && (
        <p role="alert" className="text-sm text-error">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-seal px-4 py-2 font-medium text-paper disabled:opacity-60"
      >
        Entrar
      </button>
    </form>
  )
}
