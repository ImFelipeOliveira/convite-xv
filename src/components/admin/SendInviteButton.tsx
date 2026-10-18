'use client'

import { CircleCheck, RotateCw, Send } from 'lucide-react'
import { useEffect, useRef, useState, useTransition } from 'react'
import { sendInviteAction } from '@/features/whatsapp/actions'
import { inviteErrorMessage } from '@/features/whatsapp/invite-result'
import { formatBoaVistaDateTime } from './data-table/helpers'
import { Badge } from './ui/Badge'
import { Button } from './ui/Button'
import { useToast } from './ui/Toast'

export type LastInvite = { status: 'sending' | 'sent' | 'failed'; at: string } | null

/** WhatsApp column of the guests list: send the invite through Evolution, one guest at a time. */
export function SendInviteButton({
  guest,
}: {
  guest: { id: string; name: string; hasPhone: boolean; lastInvite: LastInvite }
}) {
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const resendRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const retryRef = useRef<HTMLButtonElement>(null)
  const firstName = guest.name.trim().split(/\s+/)[0] ?? guest.name

  useEffect(() => {
    if (confirming) confirmRef.current?.focus()
  }, [confirming])

  function cancel() {
    setConfirming(false)
    // the "Reenviar" button is rendered again on the next paint
    requestAnimationFrame(() => resendRef.current?.focus())
  }

  function send() {
    startTransition(async () => {
      const fd = new FormData()
      fd.set('guestId', guest.id)
      const result = await sendInviteAction(null, fd)
      if (result.ok) toast.success(`Convite enviado para ${firstName}.`)
      else toast.error(inviteErrorMessage(result.error))
      setConfirming(false)
      // the clicked button was replaced by the new status: keep keyboard users in this cell
      requestAnimationFrame(() => {
        if (document.activeElement && document.activeElement !== document.body) return
        ;(resendRef.current ?? retryRef.current)?.focus()
      })
    })
  }

  if (!guest.hasPhone) return <span className="text-sm text-muted">Sem telefone</span>

  const last = guest.lastInvite
  const when = last ? formatBoaVistaDateTime(last.at) : ''
  // compact form for the table cell / card: "12/10 14:30"
  const short = when.replace(' às ', ' ')

  if (!last) {
    return (
      <Button
        size="sm"
        variant="secondary"
        // full width inside the phone card
        className="max-sm:min-h-11 max-sm:w-full"
        icon={<Send aria-hidden="true" className="size-4" strokeWidth={1.75} />}
        pending={pending}
        pendingLabel="Enviando…"
        onClick={send}
        aria-label={`Enviar convite para ${guest.name}`}
      >
        Enviar convite
      </Button>
    )
  }

  if (last.status === 'sending') return <Badge tone="neutral">Enviando…</Badge>

  if (last.status === 'failed') {
    return (
      <div className="flex flex-wrap items-center gap-2 max-sm:justify-between">
        <Badge tone="error">Falhou</Badge>
        <Button
          ref={retryRef}
          size="sm"
          variant="secondary"
          icon={<RotateCw aria-hidden="true" className="size-4" strokeWidth={1.75} />}
          pending={pending}
          pendingLabel="Enviando…"
          onClick={send}
          aria-label={`Tentar de novo — convite de ${guest.name}`}
        >
          Tentar de novo
        </Button>
      </div>
    )
  }

  if (confirming) {
    return (
      <div
        role="group"
        aria-label={`Confirmar reenvio para ${guest.name}`}
        className="flex flex-col gap-2"
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !pending) {
            e.stopPropagation()
            cancel()
          }
        }}
      >
        <p className="max-w-[28ch] text-sm whitespace-normal text-wine">
          Já enviado em <span className="whitespace-nowrap">{when}</span> — enviar de novo?
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button ref={confirmRef} size="sm" pending={pending} pendingLabel="Enviando…" onClick={send}>
            Enviar de novo
          </Button>
          <Button size="sm" variant="ghost" onClick={cancel} disabled={pending}>
            Cancelar
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 max-sm:justify-between">
      <p className="inline-flex items-center gap-1.5 text-sm whitespace-nowrap text-wine">
        <CircleCheck aria-hidden="true" className="size-4 shrink-0 text-sage" strokeWidth={1.75} />
        <span aria-hidden="true">
          <span className="font-medium text-sage">Enviado</span> <span className="tabular-nums">{short}</span>
        </span>
        <span className="sr-only">Enviado em {when}</span>
      </p>
      <Button
        ref={resendRef}
        size="sm"
        variant="ghost"
        // icon-only from 1280px (the desktop table is widest there)
        className="xl:size-11 xl:px-0"
        icon={<RotateCw aria-hidden="true" className="size-4" strokeWidth={1.75} />}
        onClick={() => setConfirming(true)}
        aria-label={`Reenviar convite para ${guest.name}`}
        title="Reenviar"
      >
        <span className="xl:sr-only">Reenviar</span>
      </Button>
    </div>
  )
}
