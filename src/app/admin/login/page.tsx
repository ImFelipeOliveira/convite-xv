import type { Metadata } from 'next'
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { Seal } from '@/components/admin/ui/Seal'
import { getSession } from '@/features/admin-auth/session'
import { LoginForm } from './LoginForm'

export const metadata: Metadata = { title: 'Entrar | Painel' }

async function RedirectIfSignedIn() {
  if (await getSession()) redirect('/admin')
  return null
}

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-1 items-center justify-center bg-blush px-4 py-10 font-sans text-wine">
      <Suspense>
        <RedirectIfSignedIn />
      </Suspense>
      <div className="flex w-full max-w-sm flex-col items-center gap-8 border border-hairline bg-paper px-6 pt-10 pb-8 shadow-paper sm:px-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <Seal className="size-16" />
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-[32px] leading-tight">Entrar no painel</h1>
            <p className="text-sm text-muted">Convidados e respostas dos 15 anos da Isabella.</p>
          </div>
        </div>
        <LoginForm />
      </div>
    </main>
  )
}
