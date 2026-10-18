'use client'

import { ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { formatApproxPrice } from '@/features/gifts/admin-view'
import type { GiftView } from '@/features/gifts/view'

// One gift as a paper tag (prancha 08): free (paper, "Reservar"), mine (wine, ribbon + bow, "Desfazer")
// or taken (muted, struck through, no action). `celebrate` plays the ribbon only right after the server
// confirmed this guest's reservation.

const STYLE = {
  free: { tag: 'bg-paper text-wine', meta: 'text-gold-text', hole: 'var(--gold)', link: 'text-deep-rose hover:text-wine' },
  mine: { tag: 'bg-wine text-paper', meta: 'text-gold-light', hole: 'var(--gold-light)', link: 'text-gold-light hover:text-paper' },
  taken: { tag: 'bg-[#EFD5D4] text-muted', meta: 'text-muted', hole: '#C9A9A0', link: '' },
} as const

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-[3px]'

function meta(gift: GiftView): string {
  if (gift.state === 'mine') return 'Reservado por você'
  if (gift.state === 'taken') return 'Já escolhido'
  return gift.priceCents === null ? gift.category : `${gift.category} · ${formatApproxPrice(gift.priceCents)}`
}

export function GiftTag({
  domId,
  gift,
  celebrate,
  busy,
  onReserve,
  onUndo,
}: {
  /** lets the list move focus to this tag after the sheet closes */
  domId: string
  gift: GiftView
  celebrate: boolean
  /** an undo for this gift is waiting for the server */
  busy: boolean
  onReserve: (gift: GiftView) => void
  onUndo: (gift: GiftView) => void
}) {
  const [imageBroken, setImageBroken] = useState(false)
  const s = STYLE[gift.state]
  const mine = gift.state === 'mine'
  const showImage = gift.imageUrl && !imageBroken
  const showStore = gift.purchaseUrl && gift.state !== 'taken'

  return (
    <li
      id={domId}
      className={`gift-tag relative box-border flex min-h-[92px] items-center gap-3 py-3 pr-4 pl-11 ${s.tag}`}
      data-celebrate={mine && celebrate ? '' : undefined}
    >
      <span
        aria-hidden="true"
        className="absolute top-1/2 left-[14px] -mt-[5px] h-[10px] w-[10px] rounded-full border-[1.5px] bg-blush"
        style={{ borderColor: s.hole }}
      />
      {mine && (
        <>
          <span aria-hidden="true" className="gift-ribbon absolute top-0 right-[104px] bottom-0 w-[10px] bg-lily" />
          <svg
            className="gift-bow absolute top-2 right-[92px]"
            viewBox="0 0 40 24"
            width="34"
            height="20"
            aria-hidden="true"
          >
            <path d="M20 12 C12 2 2 4 4 12 C2 20 12 22 20 12 Z" fill="#E07A9C" />
            <path d="M20 12 C28 2 38 4 36 12 C38 20 28 22 20 12 Z" fill="#E07A9C" />
            <circle cx="20" cy="12" r="3.4" fill="#C25578" />
          </svg>
        </>
      )}

      {showImage && (
        <span className="relative h-14 w-14 flex-none overflow-hidden rounded-[2px] bg-blush">
          {/* plain <img>: admin-provided https URLs, no next/image remote config */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={gift.imageUrl!}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImageBroken(true)}
            className="h-full w-full object-cover"
          />
        </span>
      )}

      <div className="relative flex min-w-0 flex-1 flex-col gap-1">
        <span
          className={`text-[19px] leading-[1.2] break-words ${gift.state === 'taken' ? 'line-through decoration-1' : ''}`}
        >
          {gift.name}
        </span>
        <span className={`font-sans text-[11px] font-medium tracking-[.14em] uppercase ${s.meta}`}>{meta(gift)}</span>
        {showStore && (
          <a
            href={gift.purchaseUrl!}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className={`gift-store -my-1 inline-flex min-h-8 items-center gap-[6px] self-start font-sans text-[13px] font-medium underline underline-offset-4 ${s.link} ${FOCUS} ${
              mine ? 'focus-visible:outline-gold-light' : 'focus-visible:outline-wine'
            }`}
          >
            {/* name "Ver {nome} na loja (abre em nova aba)" built from content, so the visible
                "Ver na loja" stays inside it (WCAG 2.5.3, label in name) */}
            <span>
              Ver<span className="sr-only"> {gift.name}</span> na loja<span className="sr-only"> (abre em nova aba)</span>
            </span>
            <ExternalLink size={13} strokeWidth={1.6} aria-hidden="true" />
          </a>
        )}
      </div>

      {gift.state === 'free' && (
        <button
          type="button"
          onClick={() => onReserve(gift)}
          aria-label={`Reservar ${gift.name}`}
          className={`gift-reserve relative h-11 flex-none rounded-full border border-seal bg-transparent px-4 font-sans text-[13px] font-medium text-seal ${FOCUS} focus-visible:outline-wine`}
        >
          Reservar
        </button>
      )}
      {mine && (
        <button
          type="button"
          onClick={() => onUndo(gift)}
          disabled={busy}
          aria-busy={busy}
          aria-label={`Desfazer reserva de ${gift.name}`}
          className={`relative h-11 flex-none border-0 bg-transparent px-1 font-sans text-[13px] font-medium text-gold-light underline underline-offset-4 disabled:opacity-60 ${FOCUS} focus-visible:outline-gold-light`}
        >
          Desfazer
        </button>
      )}
    </li>
  )
}
