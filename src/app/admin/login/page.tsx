import type { Metadata } from 'next'
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getSession } from '@/features/admin-auth/session'
import { LoginForm } from './LoginForm'

export const metadata: Metadata = { title: 'Entrar | Painel' }

async function RedirectIfSignedIn() {
  if (await getSession()) redirect('/admin')
  return null
}

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-6 bg-paper px-6 font-sans text-wine">
      <h1 className="text-2xl font-medium">Painel</h1>
      <Suspense>
        <RedirectIfSignedIn />
      </Suspense>
      <LoginForm />
    </main>
  )
}
