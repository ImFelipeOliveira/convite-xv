'use client'

import { useEffect, useRef, useState, type MouseEvent, type SyntheticEvent } from 'react'
import { releaseGiftAction, reserveGiftAction, type GiftActionResult } from '@/features/gifts/actions'
import type { GiftView } from '@/features/gifts/view'
import { GiftTag } from './GiftTag'
import { Reveal, RevealItem } from './Reveal'
import './gifts.css'

// Gifts (prancha 08, Chapter V). Reserving goes through a bottom sheet and only shows the guest's tag
// (ribbon + bow) after the server answered ok; when someone else got there first the sheet turns into
// the conflict state and the list is refreshed from the action's answer.

type Phase = 'confirm' | 'sending' | 'conflict'
type Sheet = { giftId: string; name: string; phase: Phase; error: boolean }
type Live = { text: string; tone: 'ok' | 'error' }

const ALL = 'Todos'
const CLOSE_MS = 260
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-wine'

function form(token: string, giftId: string): FormData {
  const fd = new FormData()
  fd.set('token', token)
  fd.set('giftId', giftId)
  return fd
}

async function call(
  action: typeof reserveGiftAction,
  token: string,
  giftId: string,
): Promise<GiftActionResult> {
  try {
    return await action(null, form(token, giftId))
  } catch {
    // network failure: same as a generic error
    return { ok: false, error: 'invalid' }
  }
}

function categoriesOf(gifts: GiftView[]): string[] {
  return [...new Set(gifts.map((g) => g.category))]
}

export function Gifts({
  id,
  token,
  guestFirstName,
  initialGifts,
  pixEnabled,
}: {
  id: string
  token: string
  guestFirstName: string
  initialGifts: GiftView[]
  pixEnabled: boolean
}) {
  const [gifts, setGifts] = useState(initialGifts)
  const [filter, setFilter] = useState(ALL)
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [closing, setClosing] = useState(false)
  const [live, setLive] = useState<Live | null>(null)
  const [celebrated, setCelebrated] = useState<string | null>(null)
  const [undoing, setUndoing] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const focusAfterClose = useRef<string | null>(null)

  const categories = categoriesOf(gifts)
  const activeFilter = filter === ALL || categories.includes(filter) ? filter : ALL
  const visible = activeFilter === ALL ? gifts : gifts.filter((g) => g.category === activeFilter)

  useEffect(() => {
    const dialog = dialogRef.current
    if (sheet && dialog && !dialog.open) dialog.showModal()
  }, [sheet])

  useEffect(() => () => clearTimeout(closeTimer.current), [])

  function focusGift(giftId: string | null) {
    const tag = giftId ? document.getElementById(`gift-${giftId}`) : null
    const target = tag?.querySelector<HTMLElement>('button, a[href]') ?? document.getElementById(`${id}-title`)
    target?.focus()
  }

  // `sheet`/`closing` come from the render that started the interaction (also after confirm's await)
  function closeSheet(focusGiftId: string | null = null) {
    if (!sheet || closing) return
    focusAfterClose.current = focusGiftId ?? sheet.giftId
    setClosing(true)
    clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => {
      dialogRef.current?.close()
      setSheet(null)
      setClosing(false)
      // the button that opened the sheet may be gone (reserved / taken): land on the gift's tag instead
      requestAnimationFrame(() => focusGift(focusAfterClose.current))
    }, CLOSE_MS)
  }

  function onCancel(e: SyntheticEvent<HTMLDialogElement>) {
    // Escape: animate out instead of the native instant close; never while the request is in flight
    e.preventDefault()
    if (sheet?.phase !== 'sending') closeSheet()
  }

  function onBackdrop(e: MouseEvent<HTMLDialogElement>) {
    if (e.target === e.currentTarget && sheet?.phase !== 'sending') closeSheet()
  }

  function openSheet(gift: GiftView) {
    clearTimeout(closeTimer.current)
    setClosing(false)
    setLive(null)
    setSheet({ giftId: gift.id, name: gift.name, phase: 'confirm', error: false })
  }

  async function confirm() {
    if (!sheet || sheet.phase !== 'confirm') return
    const current = sheet
    setSheet({ ...current, phase: 'sending', error: false })
    const result = await call(reserveGiftAction, token, current.giftId)
    if (result.gifts) setGifts(result.gifts)
    if (result.ok) {
      setCelebrated(current.giftId)
      setLive({ text: `${current.name} reservado. Obrigada!`, tone: 'ok' })
      closeSheet(current.giftId)
    } else if (result.error === 'taken') {
      setSheet({ ...current, phase: 'conflict', error: false })
    } else {
      setSheet({ ...current, phase: 'confirm', error: true })
    }
  }

  async function undo(gift: GiftView) {
    if (undoing) return
    setUndoing(gift.id)
    setLive(null)
    const result = await call(releaseGiftAction, token, gift.id)
    setUndoing(null)
    if (result.gifts) setGifts(result.gifts)
    if (result.ok) {
      if (celebrated === gift.id) setCelebrated(null)
      setLive({ text: `Reserva desfeita. ${gift.name} voltou para a lista.`, tone: 'ok' })
      requestAnimationFrame(() => focusGift(gift.id))
    } else {
      setLive({ text: 'Não foi possível desfazer agora. Tente de novo.', tone: 'error' })
    }
  }

  const titleId = `${id}-title`
  const sheetTitleId = `${id}-sheet-title`

  return (
    <Reveal as="section" id={id} aria-labelledby={titleId} className="relative overflow-hidden bg-blush font-display text-wine">
      <div aria-hidden="true" className="pointer-events-none absolute inset-[14px] border border-[rgba(184,149,90,.75)]" />
      <div className="relative flex flex-col px-7 pt-[52px] pb-10">
        <RevealItem className="flex flex-col">
          <span className="font-sans text-[11px] font-medium tracking-[.26em] text-gold-text">CAPÍTULO V</span>
          <h2
            id={titleId}
            tabIndex={-1}
            className="mt-[14px] mb-0 text-[40px] leading-none font-normal tracking-[-.02em] outline-none"
          >
            Presentes<span className="font-script text-[46px] text-rose">,</span> se quiser.
          </h2>
          <p className="mt-3 mb-0 text-[17px] leading-[1.5] text-deep-rose italic">
            Sua presença já é o maior presente. Se quiser escolher algo, reserve aqui — assim ninguém repete.
          </p>
        </RevealItem>

        {categories.length > 1 && (
          <RevealItem>
            <div
              role="group"
              aria-label="Filtrar por categoria"
              className="gift-chips -mx-7 mt-[22px] flex gap-2 overflow-x-auto px-7"
            >
              {[ALL, ...categories].map((c) => {
                const on = activeFilter === c
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setFilter(c)}
                    className={`gift-chip h-10 flex-none rounded-full border px-4 font-sans text-[13px] font-medium tracking-[.04em] ${FOCUS} ${
                      on ? 'border-wine bg-wine text-paper' : 'border-[rgba(184,149,90,.9)] bg-paper text-wine'
                    }`}
                  >
                    {c}
                  </button>
                )
              })}
            </div>
          </RevealItem>
        )}

        <p
          role="status"
          aria-live="polite"
          className={`mt-[14px] mb-0 min-h-[18px] font-sans text-[13px] ${live?.tone === 'error' ? 'text-error' : 'text-sage'}`}
        >
          {live?.text}
        </p>

        <ul className="m-0 mt-[6px] flex list-none flex-col gap-3 p-0">
          {visible.map((g) => (
            <GiftTag
              key={g.id}
              domId={`gift-${g.id}`}
              gift={g}
              celebrate={celebrated === g.id}
              busy={undoing === g.id}
              onReserve={openSheet}
              onUndo={undo}
            />
          ))}
        </ul>

        {pixEnabled && (
          <RevealItem>
            <a
              href="#pix"
              className="mt-7 flex items-center justify-between gap-4 bg-burgundy p-5 text-paper no-underline hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-wine"
            >
              <span className="flex flex-col gap-1">
                <span className="font-script text-[34px] leading-none text-lily">Prefere Pix?</span>
                <span className="font-sans text-[13px] text-gold-light">Contribuições a partir de R$ 70,00</span>
              </span>
              <svg width="22" height="22" viewBox="0 0 16 16" aria-hidden="true" className="flex-none text-gold-light">
                <path d="M2 8h11M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.3" />
              </svg>
            </a>
          </RevealItem>
        )}
      </div>

      <dialog
        ref={dialogRef}
        aria-labelledby={sheetTitleId}
        onCancel={onCancel}
        onClick={onBackdrop}
        data-closing={closing ? '' : undefined}
        className="gift-sheet font-display"
      >
        {sheet && (
          <div className="box-border px-7 pt-[14px] pb-[34px]">
            <div aria-hidden="true" className="mx-auto mb-[18px] h-1 w-10 rounded-[2px] bg-[#E2C3C6]" />
            {sheet.phase === 'conflict' ? (
              <div key="conflict" role="alert" className="gift-swap flex flex-col items-center text-center">
                <svg viewBox="0 0 64 64" width="56" height="56" aria-hidden="true">
                  <circle cx="32" cy="32" r="26" fill="none" stroke="#B8955A" strokeWidth="1.2" />
                  <path
                    d="M22 26c0-6 4-9 10-9s10 3 10 8c0 6-8 6-8 13"
                    fill="none"
                    stroke="#A8325E"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                  <circle cx="34" cy="46" r="1.8" fill="#A8325E" />
                </svg>
                <h3 id={sheetTitleId} className="mt-3 mb-0 text-[26px] leading-[1.2] font-normal">
                  Alguém foi mais rápido.
                </h3>
                <p className="mt-[10px] mb-0 font-sans text-[14px] leading-[1.5] text-deep-rose">
                  {sheet.name} acabou de ser reservado por outro convidado. Que tal escolher outro?
                </p>
                <button
                  type="button"
                  autoFocus
                  onClick={() => closeSheet()}
                  className={`gift-cta mt-5 h-[54px] w-full rounded-full border-0 bg-seal font-sans text-[15px] font-medium tracking-[.04em] text-paper ${FOCUS}`}
                >
                  Ver outros presentes
                </button>
              </div>
            ) : (
              <div key="confirm" className="gift-swap flex flex-col">
                <span className="font-sans text-[11px] font-medium tracking-[.24em] text-gold-text">RESERVAR PRESENTE</span>
                <h3 id={sheetTitleId} className="mt-[10px] mb-0 text-[28px] leading-[1.15] font-normal break-words">
                  {sheet.name}
                </h3>
                <div className="mt-4 flex justify-between gap-4 border-y border-[rgba(184,149,90,.6)] py-3 font-sans text-[14px]">
                  <span className="pt-[2px] text-[11px] font-medium tracking-[.2em] text-gold-text">RESERVANDO COMO</span>
                  <span className="text-right">{guestFirstName}</span>
                </div>
                <p className="mt-[14px] mb-0 font-sans text-[13px] leading-[1.5] text-deep-rose">
                  A reserva só indica que você vai levar este presente. Nenhuma cobrança é feita, e você pode desfazer
                  depois.
                </p>
                {sheet.error && (
                  <p role="alert" className="mt-3 mb-0 font-sans text-[13px] leading-[1.45] text-error">
                    Não foi possível reservar agora. Tente de novo.
                  </p>
                )}
                <button
                  type="button"
                  onClick={confirm}
                  disabled={sheet.phase === 'sending'}
                  aria-busy={sheet.phase === 'sending'}
                  className={`gift-cta mt-5 flex h-[54px] items-center justify-center gap-3 rounded-full border-0 bg-seal font-sans text-[15px] font-medium tracking-[.04em] text-paper ${FOCUS}`}
                >
                  {sheet.phase === 'sending' && <span className="gift-spin" aria-hidden="true" />}
                  <span>{sheet.phase === 'sending' ? 'Reservando…' : 'Confirmar reserva'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => closeSheet()}
                  disabled={sheet.phase === 'sending'}
                  className={`mt-[6px] h-11 border-0 bg-transparent font-sans text-[14px] font-medium text-deep-rose ${FOCUS}`}
                >
                  Voltar
                </button>
              </div>
            )}
          </div>
        )}
      </dialog>
    </Reveal>
  )
}

