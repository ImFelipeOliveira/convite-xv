'use client'

import { CircleAlert, CircleCheck, X } from 'lucide-react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { focusRing } from '../styles'

type Tone = 'success' | 'error'
type ToastItem = { id: number; tone: Tone; message: string }
type ToastApi = { success: (message: string) => void; error: (message: string) => void }

const ToastContext = createContext<ToastApi | null>(null)
const DISMISS_MS = 4000

export function useToast(): ToastApi {
  const api = useContext(ToastContext)
  if (!api) throw new Error('useToast must be used inside <ToastProvider>')
  return api
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(item.id), DISMISS_MS)
    return () => clearTimeout(t)
  }, [item.id, onDismiss])
  const Icon = item.tone === 'success' ? CircleCheck : CircleAlert
  return (
    <div
      className={`pointer-events-auto flex w-full items-start gap-3 border bg-paper py-3 pr-2 pl-4 text-[15px] text-wine shadow-paper motion-safe:animate-[toast-in_var(--dur-ui)_var(--ease-letter)] sm:w-[22rem] ${
        item.tone === 'success' ? 'border-sage/40' : 'border-error/40'
      }`}
    >
      <Icon
        aria-hidden="true"
        className={`mt-0.5 size-5 shrink-0 ${item.tone === 'success' ? 'text-sage' : 'text-error'}`}
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

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)
  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), [])
  const push = useCallback((tone: Tone, message: string) => {
    const id = nextId.current++
    setItems((list) => [...list.slice(-2), { id, tone, message }])
  }, [])
  const api = useMemo<ToastApi>(
    () => ({ success: (m) => push('success', m), error: (m) => push('error', m) }),
    [push],
  )
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        role="status"
        aria-live="polite"
        aria-label="Notificações"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-end gap-2 sm:inset-x-auto sm:top-5 sm:right-5 sm:bottom-auto"
      >
        {items.map((item) => (
          <ToastCard key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}
