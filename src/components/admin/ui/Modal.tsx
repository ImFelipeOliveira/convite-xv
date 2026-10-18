'use client'

import { X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react'
import { focusRing } from '../styles'
import { pushDialog, removeDialog } from './top-layer'

type Placement = 'center' | 'right' | 'left' | 'bottom'

const placements: Record<Placement, string> = {
  center:
    'm-auto w-[min(28rem,calc(100vw-2rem))] motion-safe:animate-[sheet-in-up_var(--dur-ui)_var(--ease-letter)]',
  // full-screen sheet on phones, side sheet from 640px
  right:
    'm-0 ml-auto h-dvh max-h-dvh w-full max-w-full sm:w-[min(32rem,100vw)] motion-safe:animate-[sheet-in-up_var(--dur-ui)_var(--ease-letter)] sm:motion-safe:animate-[sheet-in-right_var(--dur-ui)_var(--ease-letter)]',
  // bottom sheet (phones)
  bottom:
    'm-0 mt-auto w-full max-w-full border-t motion-safe:animate-[sheet-in-up_var(--dur-ui)_var(--ease-letter)]',
  left: 'm-0 mr-auto h-dvh max-h-dvh w-[min(20rem,calc(100vw-3rem))] motion-safe:animate-[sheet-in-left_var(--dur-ui)_var(--ease-letter)]',
}

/**
 * Native modal <dialog>: the browser makes the page inert (focus stays inside), Esc closes,
 * and focus goes back to the opener when it unmounts. Render it only while open.
 * Mark the element that should receive focus with `data-autofocus`.
 *
 * `returnFocusRef` names the element to focus on close (Safari doesn't focus buttons on click,
 * so `document.activeElement` is not a reliable opener); the caller may repoint it before closing.
 * `onNativeClose` runs if the browser closes the dialog by itself (defaults to `onClose`).
 */
export function Modal({
  onClose,
  onNativeClose,
  returnFocusRef,
  placement = 'center',
  labelledBy,
  label,
  children,
  className = '',
}: {
  onClose: () => void
  onNativeClose?: () => void
  returnFocusRef?: RefObject<HTMLElement | null>
  placement?: Placement
  labelledBy?: string
  label?: string
  children: ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const onCloseRef = useRef(onClose)
  const onNativeCloseRef = useRef(onNativeClose ?? onClose)
  const unmounting = useRef(false)
  useEffect(() => {
    onCloseRef.current = onClose
    onNativeCloseRef.current = onNativeClose ?? onClose
  })

  useLayoutEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    unmounting.current = false
    const fallbackOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (!dialog.open) dialog.showModal()
    pushDialog(dialog)
    // showModal() focuses the first focusable element; prefer the one the content marked
    dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    return () => {
      unmounting.current = true
      removeDialog(dialog)
      if (dialog.open) dialog.close()
      // read at close time on purpose: the caller may repoint it (e.g. to the search after a delete)
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const target = returnFocusRef?.current ?? fallbackOpener
      if (target?.isConnected) target.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      aria-label={label}
      onCancel={(e) => {
        e.preventDefault()
        onCloseRef.current()
      }}
      onClose={(e) => {
        // closed by the browser, not by unmounting (or a dev re-mount that reopened it): sync React state
        if (!unmounting.current && !e.currentTarget.open) onNativeCloseRef.current()
      }}
      onClick={(e) => {
        // a click on the ::backdrop targets the dialog element itself
        if (e.target === e.currentTarget) onCloseRef.current()
      }}
      className={`border-hairline bg-paper p-0 text-wine shadow-paper backdrop:bg-burgundy/45 ${placements[placement]} ${className}`}
    >
      {children}
    </dialog>
  )
}

export function CloseButton({ onClick, label = 'Fechar' }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`grid size-11 shrink-0 place-items-center rounded-full text-muted transition-colors duration-(--dur-micro) ease-(--ease-letter) hover:bg-blush hover:text-wine active:bg-petal/60 ${focusRing}`}
    >
      <X aria-hidden="true" className="size-5" strokeWidth={1.75} />
    </button>
  )
}

/** Side sheet (desktop) / full-screen sheet (mobile) with a title bar. */
export function Sheet({
  id,
  title,
  description,
  onClose,
  returnFocusRef,
  children,
}: {
  id: string
  title: string
  description?: string
  onClose: () => void
  returnFocusRef?: RefObject<HTMLElement | null>
  children: ReactNode
}) {
  return (
    <Modal
      onClose={onClose}
      returnFocusRef={returnFocusRef}
      placement="right"
      labelledBy={`${id}-title`}
      className="border-l"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-start gap-3 border-b border-hairline px-5 py-4 sm:px-6">
          <div className="flex flex-1 flex-col gap-1 pt-1.5">
            <h2 id={`${id}-title`} className="font-display text-[26px] leading-tight">
              {title}
            </h2>
            {description && <p className="text-sm text-muted">{description}</p>}
          </div>
          <CloseButton onClick={onClose} />
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-6">{children}</div>
      </div>
    </Modal>
  )
}
