import Link from 'next/link'
import { Suspense } from 'react'
import { signOut } from '@/features/admin-auth/actions'
import { requireAdmin } from '@/features/admin-auth/guard'

const NAV = [
  { href: '/admin', label: 'Resumo' },
  { href: '/admin/guests', label: 'Convidados' },
  { href: '/admin/messages', label: 'Recados' },
  { href: '/admin/settings', label: 'Configurações' },
]

// The session read happens inside Suspense (cookies() is request-time with Cache Components),
// and gates the children: nothing of the panel renders without a valid session.
async function Guard({ children }: { children: React.ReactNode }) {
  await requireAdmin()
  return <>{children}</>
}

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-paper font-sans text-wine">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-petal px-4 py-3">
        <nav className="flex flex-wrap gap-4 text-sm">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="hover:underline">
              {item.label}
            </Link>
          ))}
        </nav>
        <form action={signOut} className="ml-auto">
          <button type="submit" className="text-sm underline">
            Sair
          </button>
        </form>
      </header>
      <Suspense fallback={<p className="p-4 text-sm">Carregando…</p>}>
        <Guard>
          <div className="p-4">{children}</div>
        </Guard>
      </Suspense>
    </div>
  )
}
