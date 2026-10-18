'use client'

import { CircleAlert, CircleCheck, RotateCw, X } from 'lucide-react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { focusRing } from '../styles'
import { getTopDialog, subscribeTopDialog } from './top-layer'

type Tone = 'success' | 'error' | 'info'
type ToastItem = { id: number; tone: Tone; message: string }
type ToastApi = {
  success: (message: string) => void
  error: (message: string) => void
  /** neutral notice (auto-dismisses like success), e.g. the panel reloading after a deploy */
  info: (message: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)
const DISMISS_MS = 4000

export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast must be used inside <ToastProvider>')
  return api
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  // success auto-dismisses after 4 s (paused while hovered or focused); errors stay until dismissed
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const remaining = useRef(DISMISS_MS)
  const paused = hovered || focused
  useEffect(() => {
    if (item.tone === 'error' || paused) return
    const startedAt = Date.now()
    const t = setTimeout(() => onDismiss(item.id), remaining.current)
    return () => {
      clearTimeout(t)
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt))
    }
  }, [item.id, item.tone, paused, onDismiss])
  const Icon = item.tone === 'success' ? CircleCheck : item.tone === 'info' ? RotateCw : CircleAlert
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false)
      }}
      className={`pointer-events-auto flex w-full items-start gap-3 border bg-paper py-3 pr-2 pl-4 text-[15px] text-wine shadow-paper motion-safe:animate-[toast-in_var(--dur-ui)_var(--ease-letter)] sm:w-[22rem] ${
        item.tone === 'error' ? 'border-error/40' : 'border-sage/40'
      }`}
    >
      <Icon
        aria-hidden="true"
        className={`mt-0.5 size-5 shrink-0 ${item.tone === 'error' ? 'text-error' : 'text-sage'}`}
        strokeWidth={1.75}
      />
      <p className="flex-1 py-0.5 leading-snug">{item.message}</p>
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        aria-label="Fechar notificação"
        className={`-my-1 grid size-9 shrink-0 place-items-center rounded-full text-muted transition-colors duration-(--dur-micro) hover:bg-blush hover:text-wine ${focusRing}`}
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
  )
}

const noopSubscribe = () => () => {}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)
  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), [])
  const push = useCallback((tone: Tone, message: string) => {
    const id = nextId.current++
    setItems((list) => [...list.slice(-2), { id, tone, message }])
  }, [])
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  )
  const topDialog = useSyncExternalStore(subscribeTopDialog, getTopDialog, () => null)
  // phones: a bottom sheet (filters, more actions) keeps its buttons at the bottom; toasts go to the top
  const overBottomSheet = topDialog?.dataset.placement === 'bottom'
  const api = useMemo<ToastApi>(
    () => ({ success: (m) => push('success', m), error: (m) => push('error', m), info: (m) => push('info', m) }),
    [push],
  )
  return (
    <ToastContext.Provider value={api}>
      {children}
      {mounted &&
        // an open modal <dialog> sits in the top layer and makes the rest of the page inert:
        // render the region inside the topmost dialog so toasts stay visible and dismissible.
        // Phones: lifted above sticky bottom bars (settings save bar), or at the top over a bottom sheet;
        // desktop: bottom-right, clear of header actions
        createPortal(
          <div
            role="status"
            aria-live="polite"
            aria-label="Notificações"
            className={`pointer-events-none fixed inset-x-4 z-[60] flex flex-col items-end gap-2 sm:inset-x-auto sm:top-auto sm:right-6 sm:bottom-6 ${
              overBottomSheet ? 'top-[max(1rem,env(safe-area-inset-top))] bottom-auto' : 'bottom-24'
            }`}
          >
            {items.map((item) => (
              <ToastCard key={item.id} item={item} onDismiss={dismiss} />
            ))}
          </div>,
          topDialog ?? document.body,
        )}
    </ToastContext.Provider>
  )
}
