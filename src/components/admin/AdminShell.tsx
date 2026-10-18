'use client'

import { House, LogOut, Menu, MessageCircle, MessageSquareHeart, Settings, Users } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Suspense, useRef, useState, type ReactNode } from 'react'
import { signOut } from '@/features/admin-auth/actions'
import { focusRing } from './styles'
import { Modal, CloseButton } from './ui/Modal'
import { Seal } from './ui/Seal'
import { ToastProvider } from './ui/Toast'

const NAV = [
  { href: '/admin', label: 'Resumo', icon: House },
  { href: '/admin/guests', label: 'Convidados', icon: Users },
  { href: '/admin/messages', label: 'Recados', icon: MessageSquareHeart },
  { href: '/admin/whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { href: '/admin/settings', label: 'Configurações', icon: Settings },
] as const

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false
  return href === '/admin' ? pathname === '/admin' : pathname === href || pathname.startsWith(`${href}/`)
}

const itemClass = (active: boolean) =>
  `group relative flex min-h-11 items-center gap-3 rounded-full px-4 text-[15px] transition-[background-color,color] duration-(--dur-micro) ease-(--ease-letter) ${focusRing} ${
    active ? 'bg-paper font-medium text-seal shadow-paper' : 'text-wine hover:bg-paper/70 active:bg-paper'
  }`

function Brand() {
  return (
    <Link href="/admin" className={`flex items-center gap-3 rounded-sm ${focusRing}`}>
      <Seal className="size-11 shrink-0" />
      <span className="flex flex-col leading-tight">
        <span className="font-display text-lg">Painel</span>
        <span className="text-[13px] text-muted">15 anos da Isabella</span>
      </span>
    </Link>
  )
}

function NavList({ pathname, onNavigate }: { pathname: string | null; onNavigate?: () => void }) {
  return (
    <nav aria-label="Painel" className="flex flex-1 flex-col">
      <ul className="flex flex-col gap-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href)
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                onClick={onNavigate}
                className={itemClass(active)}
              >
                <Icon aria-hidden="true" className="size-[18px] shrink-0" strokeWidth={1.75} />
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
      <form action={signOut} className="mt-auto border-t border-hairline pt-4">
        <button type="submit" className={`${itemClass(false)} w-full`}>
          <LogOut aria-hidden="true" className="size-[18px] shrink-0" strokeWidth={1.75} />
          Sair
        </button>
      </form>
    </nav>
  )
}

// usePathname() is request data: read it inside Suspense so routes can still prerender their shell
function ActiveNavList({ onNavigate }: { onNavigate?: () => void }) {
  return <NavList pathname={usePathname()} onNavigate={onNavigate} />
}

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Suspense fallback={<NavList pathname={null} onNavigate={onNavigate} />}>
      <ActiveNavList onNavigate={onNavigate} />
    </Suspense>
  )
}

export function AdminShell({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)

  return (
    <ToastProvider>
      <div className="min-h-dvh w-full bg-paper font-sans text-wine lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
        {/* desktop sidebar */}
        {/* the grid cell spans the whole page height; only its content sticks */}
        <aside className="hidden border-r border-hairline bg-blush lg:block">
          <div className="sticky top-0 flex h-dvh flex-col gap-8 px-4 py-6">
            <div className="px-2">
              <Brand />
            </div>
            <Nav />
          </div>
        </aside>

        {/* mobile / tablet top bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-hairline bg-blush/95 px-2 backdrop-blur-sm sm:px-4 lg:hidden">
          <button
            type="button"
            ref={menuButton}
            onClick={() => setDrawerOpen(true)}
            aria-label="Abrir menu"
            aria-expanded={drawerOpen}
            className={`grid size-11 place-items-center rounded-full transition-colors duration-(--dur-micro) hover:bg-paper/70 active:bg-paper ${focusRing}`}
          >
            <Menu aria-hidden="true" className="size-5" strokeWidth={1.75} />
          </button>
          <Brand />
        </header>
        {drawerOpen && (
          <Modal
            returnFocusRef={menuButton}
            onClose={() => setDrawerOpen(false)}
            placement="left"
            label="Menu"
            className="border-r !bg-blush"
          >
            <div className="flex h-full flex-col gap-6 px-4 py-4">
              <div className="flex items-center justify-between gap-2 pl-2">
                <Brand />
                <CloseButton onClick={() => setDrawerOpen(false)} label="Fechar menu" />
              </div>
              <Nav onNavigate={() => setDrawerOpen(false)} />
            </div>
          </Modal>
        )}

        <main className="min-w-0 px-4 py-6 sm:px-8 sm:py-10 xl:px-12">
          <div className="mx-auto w-full max-w-[75rem]">{children}</div>
        </main>
      </div>
    </ToastProvider>
  )
}
