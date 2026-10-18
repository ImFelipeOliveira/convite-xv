'use client'

import { TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from './Button'
import { Modal } from './Modal'

export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  pendingLabel,
  pending,
  onConfirm,
  onCancel,
}: {
  title: string
  children: ReactNode
  confirmLabel: string
  pendingLabel: string
  pending: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const close = () => {
    if (!pending) onCancel()
  }
  return (
    <Modal onClose={close} labelledBy="confirm-title" className="border">
      <div className="flex flex-col gap-5 p-6">
        <div className="flex items-start gap-4">
          <span
            aria-hidden="true"
            className="grid size-11 shrink-0 place-items-center rounded-full bg-blush text-error"
          >
            <TriangleAlert className="size-5" strokeWidth={1.75} />
          </span>
          <div className="flex flex-col gap-1.5 pt-1">
            <h2 id="confirm-title" className="font-display text-2xl leading-tight">
              {title}
            </h2>
            <div className="text-[15px] leading-relaxed text-muted">{children}</div>
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={close} disabled={pending} data-autofocus>
            Cancelar
          </Button>
          <Button variant="danger" onClick={onConfirm} pending={pending} pendingLabel={pendingLabel}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
