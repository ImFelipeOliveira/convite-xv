'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { deleteGuestAction } from '@/features/guests/actions'
import { dangerButtonClass, secondaryButtonClass } from './styles'

type Props = { id: string; name: string; inviteUrl: string; whatsappUrl: string }

export function GuestRowActions({ id, name, inviteUrl, whatsappUrl }: Props) {
  const [notice, setNotice] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [pending, startTransition] = useTransition()

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setNotice('Link copiado')
    } catch {
      setNotice('Não foi possível copiar o link')
    }
  }

  function confirmDelete() {
    startTransition(async () => {
      const result = await deleteGuestAction(id)
      if (!result.ok) {
        setNotice('Não foi possível excluir')
        setConfirming(false)
      }
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={copyLink}
        aria-label={`Copiar link de ${name}`}
        className={secondaryButtonClass}
      >
        Copiar link
      </button>
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Enviar pelo WhatsApp para ${name}`}
        className={secondaryButtonClass}
      >
        Enviar pelo WhatsApp
      </a>
      <Link href={`/admin/guests/${id}`} aria-label={`Editar ${name}`} className={secondaryButtonClass}>
        Editar
      </Link>
      {confirming ? (
        <>
          <button
            type="button"
            onClick={confirmDelete}
            disabled={pending}
            aria-label={`Confirmar exclusão de ${name}`}
            className={dangerButtonClass}
          >
            Confirmar exclusão
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={pending}
            className={secondaryButtonClass}
          >
            Cancelar
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => {
            setNotice(null)
            setConfirming(true)
          }}
          aria-label={`Excluir ${name}`}
          className={secondaryButtonClass}
        >
          Excluir
        </button>
      )}
      <span role="status" className="text-sm">
        {notice}
      </span>
    </div>
  )
}
