'use client'

import { startTransition, useActionState, useId, useState, type CSSProperties, type FormEvent } from 'react'
import { EVENT } from '@/features/event/event'
import { submitRsvpAction, type RsvpActionResult } from '@/features/rsvp/actions'
import { formatDayMonth, formatRespondedAt } from '@/features/rsvp/format'
import { rsvpErrorMessage } from '@/features/rsvp/messages'
import type { RsvpGuestView } from '@/features/rsvp/view'
import { Reveal, RevealItem } from './Reveal'
import './rsvp.css'

// RSVP (prancha 07, Chapter IV). The form posts through the server action; the final screens and the
// confirmation motion only appear once the server answered ok (no optimistic UI). After the deadline
// (`closed`) the current answer is read-only, with the family's contact.

type Choice = 'yes' | 'no'
type RsvpError = Extract<RsvpActionResult, { ok: false }>['error']

type ActionState = {
  saved: RsvpGuestView
  result: RsvpActionResult | null
  /** bumps on every server answer, so the client can react to it once */
  seq: number
}

const GOLD_LINE = 'rgba(184,149,90,.6)'
const label = 'font-sans text-[11px] font-medium tracking-[.22em] text-gold-text'

async function submit(prev: ActionState, formData: FormData): Promise<ActionState> {
  let result: RsvpActionResult
  try {
    result = await submitRsvpAction(null, formData)
  } catch {
    // network failure: same message as a generic error, the form stays filled
    result = { ok: false, error: 'invalid' }
  }
  return { saved: result.ok ? result.guest : prev.saved, result, seq: prev.seq + 1 }
}

function shownPlusOnes(g: RsvpGuestView): number {
  return Math.min(g.plusOnes, g.plusOnesLimit)
}

function limitText(limit: number, count: number): string {
  if (limit === 0) return 'Este convite é individual.'
  if (count >= limit) return 'Limite do seu convite atingido.'
  return `Seu convite inclui até ${limit} ${limit === 1 ? 'acompanhante' : 'acompanhantes'}.`
}

function peopleText(count: number): string {
  return count === 0 ? 'Só você' : `Você + ${count}`
}

export function Rsvp({
  guest,
  token,
  deadline,
  closed,
  contact,
}: {
  guest: RsvpGuestView
  token: string
  /** 'YYYY-MM-DD' */
  deadline: string
  closed: boolean
  contact: string | null
}) {
  const [state, dispatch, pending] = useActionState(submit, { saved: guest, result: null, seq: 0 })
  const { saved } = state

  const [editing, setEditing] = useState(guest.rsvpStatus === 'pending')
  const [choice, setChoice] = useState<Choice | null>(guest.rsvpStatus === 'pending' ? null : guest.rsvpStatus)
  const [plusOnes, setPlusOnes] = useState(shownPlusOnes(guest))
  const [message, setMessage] = useState(guest.message ?? '')
  const [phone, setPhone] = useState('')
  const [seenSeq, setSeenSeq] = useState(0)
  const [errorShown, setErrorShown] = useState(false)
  const [celebrate, setCelebrate] = useState(false)

  // React to a new server answer once (adjusting state during render, not in an effect).
  if (state.seq !== seenSeq) {
    setSeenSeq(state.seq)
    if (state.result?.ok) {
      const g = state.result.guest
      setEditing(false)
      setCelebrate(true)
      setErrorShown(false)
      setChoice(g.rsvpStatus === 'pending' ? null : g.rsvpStatus)
      setPlusOnes(shownPlusOnes(g))
      setMessage(g.message ?? '')
      setPhone('')
    } else {
      setErrorShown(true)
    }
  }

  const error: RsvpError | null = errorShown && state.result && !state.result.ok ? state.result.error : null
  const deadlineLabel = formatDayMonth(deadline)

  function edit() {
    setEditing(true)
    setCelebrate(false)
    setErrorShown(false)
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!choice || pending) return
    const fd = new FormData()
    fd.set('token', token)
    fd.set('status', choice)
    fd.set('plusOnes', String(choice === 'yes' ? plusOnes : 0))
    fd.set('message', message)
    if (choice === 'yes' && !saved.hasPhone) fd.set('phone', phone)
    startTransition(() => dispatch(fd))
  }

  const view = closed
    ? 'closed'
    : !editing && saved.rsvpStatus === 'yes'
      ? 'doneYes'
      : !editing && saved.rsvpStatus === 'no'
        ? 'doneNo'
        : 'form'

  return (
    <Reveal
      as="section"
      id="rsvp"
      aria-labelledby="rsvp-title"
      className="relative overflow-hidden bg-blush font-display text-wine"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-[14px] border border-[rgba(184,149,90,.75)]" />
      <div className="relative flex min-h-dvh flex-col px-8 pt-[52px] pb-10">
        <RevealItem>
          <div className="flex items-center justify-between">
            <span className="font-sans text-[11px] font-medium tracking-[.26em] text-gold-text">CAPÍTULO IV</span>
            <StatusBadge status={saved.rsvpStatus} />
          </div>
          <h2 id="rsvp-title" className="mt-[14px] mb-0 text-[40px] leading-none font-normal tracking-[-.02em]">
            Sua presença.
          </h2>
        </RevealItem>

        <RevealItem className={`flex min-h-0 flex-1 flex-col ${celebrate ? 'rsvp-celebrate' : ''}`}>
          {view === 'closed' && <ClosedView guest={saved} contact={contact} />}
          {view === 'doneYes' && <DoneYes guest={saved} token={token} celebrate={celebrate} onEdit={edit} />}
          {view === 'doneNo' && <DoneNo deadlineLabel={deadlineLabel} celebrate={celebrate} onEdit={edit} />}
          {view === 'form' && (
            <RsvpForm
              name={saved.name}
              deadlineLabel={deadlineLabel}
              limit={saved.plusOnesLimit}
              askPhone={choice === 'yes' && !saved.hasPhone}
              choice={choice}
              plusOnes={plusOnes}
              message={message}
              phone={phone}
              pending={pending}
              error={error}
              onChoice={(c) => {
                setChoice(c)
                setErrorShown(false)
              }}
              onPlusOnes={(n) => {
                setPlusOnes(n)
                setErrorShown(false)
              }}
              onMessage={(m) => {
                setMessage(m)
                setErrorShown(false)
              }}
              onPhone={(p) => {
                setPhone(p)
                setErrorShown(false)
              }}
              onSubmit={onSubmit}
            />
          )}
        </RevealItem>
      </div>
    </Reveal>
  )
}

function StatusBadge({ status }: { status: RsvpGuestView['rsvpStatus'] }) {
  const badge =
    status === 'yes'
      ? { text: 'CONFIRMADA', className: 'border-sage bg-sage text-paper' }
      : status === 'no'
        ? { text: 'RECUSADA', className: 'border-deep-rose bg-transparent text-deep-rose' }
        : { text: 'AGUARDANDO RESPOSTA', className: 'border-gold-text bg-transparent text-gold-text' }
  return (
    <span
      className={`flex h-[26px] items-center gap-[6px] rounded-full border px-[10px] font-sans text-[10px] font-medium tracking-[.14em] ${badge.className}`}
    >
      {badge.text}
    </span>
  )
}

function ErrorIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true" className="mt-px flex-none">
      <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M7 3.6v4.2M7 9.6v.8" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

function RsvpForm({
  name,
  deadlineLabel,
  limit,
  askPhone,
  choice,
  plusOnes,
  message,
  phone,
  pending,
  error,
  onChoice,
  onPlusOnes,
  onMessage,
  onPhone,
  onSubmit,
}: {
  name: string
  deadlineLabel: string
  limit: number
  askPhone: boolean
  choice: Choice | null
  plusOnes: number
  message: string
  phone: string
  pending: boolean
  error: RsvpError | null
  onChoice: (c: Choice) => void
  onPlusOnes: (n: number) => void
  onMessage: (m: string) => void
  onPhone: (p: string) => void
  onSubmit: (e: FormEvent<HTMLFormElement>) => void
}) {
  const count = Math.min(plusOnes, limit)
  const phoneError = error === 'invalid_phone' && askPhone
  const alertError = error && !phoneError ? rsvpErrorMessage(error, limit) : null
  const submitLabel = pending ? 'Enviando…' : choice === 'no' ? 'Enviar resposta' : 'Confirmar presença'

  return (
    <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <p className="mt-3 mb-0 text-[17px] leading-[1.5] text-deep-rose italic">
        Olá, <span className="text-wine not-italic">{name}</span>. Este convite é só seu — responda até {deadlineLabel}.
      </p>

      <fieldset className="m-0 mt-[22px] flex flex-col gap-[10px] border-0 p-0">
        <legend className={`mb-[10px] p-0 ${label}`}>VOCÊ VEM?</legend>
        <Option
          value="yes"
          title="Vou com certeza"
          hint="Quero celebrar junto"
          checked={choice === 'yes'}
          disabled={pending}
          onChoose={onChoice}
        />
        <Option
          value="no"
          title="Não poderei ir"
          hint="Vou avisar com carinho"
          checked={choice === 'no'}
          disabled={pending}
          onChoose={onChoice}
        />
      </fieldset>

      {choice === 'yes' && (
        <div
          className="rsvp-reveal mt-[18px] flex items-center justify-between gap-3 border-y py-[14px]"
          style={{ borderColor: GOLD_LINE }}
        >
          <div className="flex flex-col gap-[3px]">
            <span id="rsvp-plus-ones-label" className={label}>
              ACOMPANHANTES
            </span>
            <span
              className={`font-sans text-[12px] ${count >= limit && limit > 0 ? 'text-wine' : 'text-deep-rose'}`}
            >
              {limitText(limit, count)}
            </span>
          </div>
          <div role="group" aria-labelledby="rsvp-plus-ones-label" className="flex items-center gap-[6px]">
            <StepButton label="Remover acompanhante" disabled={pending || count <= 0} dim={count <= 0} onClick={() => onPlusOnes(Math.max(0, count - 1))}>
              −
            </StepButton>
            <output aria-live="polite" className="w-9 text-center text-[30px] leading-none">
              {count}
            </output>
            <StepButton
              label="Adicionar acompanhante"
              disabled={pending || count >= limit}
              dim={count >= limit}
              onClick={() => onPlusOnes(Math.min(limit, count + 1))}
            >
              +
            </StepButton>
          </div>
        </div>
      )}

      {askPhone && (
        <div className="rsvp-reveal mt-[18px] flex flex-col gap-2 font-sans">
          <label htmlFor="rsvp-phone" className="text-[12px] font-medium tracking-[.18em] text-gold-text">
            <span className="uppercase">Seu WhatsApp para lembretes</span>{' '}
            <span className="font-normal tracking-[.08em]">(opcional)</span>
          </label>
          <input
            id="rsvp-phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="(95) 99999-9999"
            value={phone}
            onChange={(e) => onPhone(e.target.value)}
            disabled={pending}
            aria-invalid={phoneError}
            aria-describedby={phoneError ? 'rsvp-phone-error' : 'rsvp-phone-hint'}
            className="rsvp-input box-border h-[52px] rounded-[2px] border border-[rgba(184,149,90,.8)] bg-paper px-4 font-sans text-[16px] text-wine"
          />
          {phoneError ? (
            <span id="rsvp-phone-error" role="alert" className="flex items-start gap-[6px] text-[13px] leading-[1.4] text-error">
              <ErrorIcon size={14} />
              {rsvpErrorMessage('invalid_phone')}
            </span>
          ) : (
            <span id="rsvp-phone-hint" className="text-[12px] text-deep-rose">
              Usaremos só para lembrar você da festa.
            </span>
          )}
        </div>
      )}

      <div className="mt-[18px] flex flex-col gap-2">
        <label htmlFor="rsvp-message" className={label}>
          <span className="uppercase">Recado para a {EVENT.celebrant}</span>{' '}
          <span className="font-normal tracking-[.08em]">(opcional)</span>
        </label>
        <textarea
          id="rsvp-message"
          name="message"
          rows={2}
          maxLength={280}
          value={message}
          onChange={(e) => onMessage(e.target.value)}
          disabled={pending}
          placeholder="Escreva algo curto e carinhoso"
          className="resize-none rounded-[2px] border border-[rgba(184,149,90,.8)] bg-paper px-[14px] py-3 font-sans text-[16px] leading-[1.4] text-wine focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-wine"
        />
      </div>

      <div className="min-h-6 flex-1" />

      {alertError && (
        <div
          role="alert"
          className="rsvp-shake mb-3 flex items-start gap-[10px] border border-error bg-paper px-[14px] py-3 font-sans text-[13px] leading-[1.45] text-error"
        >
          <ErrorIcon size={16} />
          <span>{alertError}</span>
        </div>
      )}
      <button
        type="submit"
        disabled={pending || !choice}
        aria-busy={pending}
        className={`rsvp-cta flex h-[54px] items-center justify-center gap-3 rounded-full border-0 font-sans text-[15px] font-medium tracking-[.04em] focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-wine ${
          choice ? 'cursor-pointer bg-seal text-paper' : 'cursor-not-allowed bg-[#EBCFD2] text-[#7D4A5E]'
        }`}
      >
        {pending && <span className="rsvp-spin" aria-hidden="true" />}
        <span>{submitLabel}</span>
      </button>
    </form>
  )
}

function Option({
  value,
  title,
  hint,
  checked,
  disabled,
  onChoose,
}: {
  value: Choice
  title: string
  hint: string
  checked: boolean
  disabled: boolean
  onChoose: (c: Choice) => void
}) {
  const id = `rsvp-${value}`
  return (
    <div className="rsvp-option relative">
      <input
        type="radio"
        id={id}
        name="status"
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onChoose(value)}
      />
      <label
        htmlFor={id}
        className={`box-border flex min-h-16 cursor-pointer items-center gap-[14px] border px-[18px] ${
          checked ? 'border-seal bg-paper' : 'border-[rgba(184,149,90,.8)] bg-[rgba(255,248,246,.45)]'
        }`}
      >
        <span aria-hidden="true" className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full border border-seal">
          <span className="rsvp-dot h-3 w-3 rounded-full bg-seal" style={{ transform: `scale(${checked ? 1 : 0})` }} />
        </span>
        <span className="flex flex-col gap-[2px]">
          <span className="text-[20px]">{title}</span>
          <span className="font-sans text-[12px] text-deep-rose">{hint}</span>
        </span>
      </label>
    </div>
  )
}

function StepButton({
  label: ariaLabel,
  disabled,
  dim,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  dim: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className="rsvp-step h-11 w-11 cursor-pointer rounded-full border border-[rgba(184,149,90,.9)] bg-paper text-[20px] leading-none text-wine focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-wine"
      style={{ opacity: dim ? 0.4 : 1 }}
    >
      {children}
    </button>
  )
}

/** Rows under the final screens: label on the left, value on the right, gold rules between. */
function SummaryRows({ rows }: { rows: [string, string][] }) {
  return (
    <div className="flex w-full flex-col border-b font-sans text-[14px]" style={{ borderColor: GOLD_LINE }}>
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 border-t py-3" style={{ borderColor: GOLD_LINE }}>
          <span className="text-[11px] font-medium tracking-[.2em] text-gold-text">{k}</span>
          <span className="text-right whitespace-pre-line">{v}</span>
        </div>
      ))}
    </div>
  )
}

const WHEN = 'Dom, 27 dez · 10h'

const BURST: { w: number; h: number; round?: boolean; color: string; x: number; y: number; r: number }[] = [
  { w: 12, h: 17, color: '#EE9DB6', x: -96, y: -70, r: -140 },
  { w: 10, h: 14, color: '#E07A9C', x: 92, y: -84, r: 160 },
  { w: 12, h: 17, color: '#F3AFC4', x: 110, y: 30, r: 220 },
  { w: 9, h: 13, color: '#EE9DB6', x: -112, y: 40, r: -200 },
  { w: 6, h: 6, round: true, color: '#E3C891', x: -30, y: -110, r: 0 },
  { w: 6, h: 6, round: true, color: '#E3C891', x: 44, y: 104, r: 0 },
  { w: 11, h: 15, color: '#E07A9C', x: -60, y: 100, r: 120 },
]

function delay(seconds: number): CSSProperties {
  return { animationDelay: `${seconds}s` }
}

function DoneYes({
  guest,
  token,
  celebrate,
  onEdit,
}: {
  guest: RsvpGuestView
  token: string
  celebrate: boolean
  onEdit: () => void
}) {
  const gradientId = useId()
  return (
    <div className="flex flex-1 flex-col items-center pt-9 text-center">
      <div className="relative h-40 w-40">
        {celebrate &&
          BURST.map((p, i) => (
            <span
              key={i}
              aria-hidden="true"
              className="rsvp-burst absolute top-[70px] left-[72px]"
              style={
                {
                  width: p.w,
                  height: p.h,
                  borderRadius: p.round ? '50%' : '80% 0 80% 0',
                  background: p.color,
                  '--x': `${p.x}px`,
                  '--y': `${p.y}px`,
                  '--r': `${p.r}deg`,
                } as CSSProperties
              }
            />
          ))}
        <svg
          className="rsvp-stamp absolute top-0 left-0 drop-shadow-[0_10px_12px_rgba(90,33,54,.3)]"
          viewBox="0 0 160 160"
          width="160"
          height="160"
          aria-hidden="true"
        >
          <defs>
            <radialGradient id={gradientId} cx=".4" cy=".35" r=".75">
              <stop offset="0" stopColor="#D0588A" />
              <stop offset=".6" stopColor="#A8325E" />
              <stop offset="1" stopColor="#7A1F43" />
            </radialGradient>
          </defs>
          <path
            fill={`url(#${gradientId})`}
            d="M80 8 C98 6 112 14 124 22 C138 30 150 44 152 62 C156 78 154 96 146 110 C140 124 128 140 110 148 C96 154 78 156 62 150 C44 146 28 134 18 118 C8 102 6 84 10 66 C12 48 24 32 38 22 C50 12 64 8 80 8 Z"
          />
          <circle
            className="rsvp-ring"
            pathLength={1}
            cx="80"
            cy="80"
            r="48"
            fill="none"
            stroke="#F3C6D6"
            strokeWidth="2"
            transform="rotate(-90 80 80)"
          />
          <path
            className="rsvp-check"
            pathLength={1}
            d="M58 81 L74 97 L104 64"
            fill="none"
            stroke="#FFF8F6"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h3 className="rsvp-up mt-7 mb-0 text-[32px] leading-[1.1] font-normal" style={delay(0.9)}>
        Presença confirmada.
      </h3>
      <div className="rsvp-up mt-[6px] font-script text-[48px] leading-[1.1] text-rose" style={delay(1.05)}>
        Até lá!
      </div>
      <div className="rsvp-up mt-[18px] w-full" style={delay(1.2)}>
        <SummaryRows
          rows={[
            ['PESSOAS', peopleText(shownPlusOnes(guest))],
            ['QUANDO', WHEN],
          ]}
        />
      </div>
      {guest.respondedAt && (
        <span className="rsvp-up mt-[10px] font-sans text-[12px] text-deep-rose" style={delay(1.3)}>
          {formatRespondedAt(guest.respondedAt)}
        </span>
      )}
      <div className="min-h-6 flex-1" />
      <div className="rsvp-up flex w-full flex-col items-center gap-[6px]" style={delay(1.4)}>
        <a
          href={`/c/${token}/calendar.ics`}
          className="rsvp-cta flex h-[54px] w-full items-center justify-center rounded-full bg-seal font-sans text-[15px] font-medium tracking-[.04em] text-paper no-underline hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-wine"
        >
          Adicionar à agenda
        </a>
        <button
          type="button"
          onClick={onEdit}
          className="h-11 cursor-pointer border-0 bg-transparent font-sans text-[14px] font-medium text-deep-rose underline decoration-[rgba(184,149,90,.8)] underline-offset-[5px] focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-wine"
        >
          Alterar resposta
        </button>
      </div>
    </div>
  )
}

const PETAL_NARROW =
  'M120 130 C108 104 104 70 114 40 C116 34 118 30 120 28 C123 33 126 40 127 48 C133 76 130 106 120 130 Z'
const PETAL_WIDE = 'M120 130 C98 106 90 64 108 30 C112 22 117 18 120 16 C125 20 131 28 134 38 C146 70 138 106 120 130 Z'

function DoneNo({
  deadlineLabel,
  celebrate,
  onEdit,
}: {
  deadlineLabel: string
  celebrate: boolean
  onEdit: () => void
}) {
  return (
    <div className="flex flex-1 flex-col items-center pt-[30px] text-center">
      <div className="relative h-[170px] w-[150px]">
        <svg viewBox="0 0 240 240" width="150" height="150" aria-hidden="true" className="absolute top-0 left-0">
          <g className="rsvp-closing">
            <path transform="rotate(60 120 130)" fill="#EE9DB6" d={PETAL_NARROW} />
            <path transform="rotate(300 120 130)" fill="#EE9DB6" d={PETAL_NARROW} />
            <path transform="rotate(-24 120 130)" fill="#F3AFC4" d={PETAL_WIDE} />
            <path transform="rotate(24 120 130)" fill="#E8A0B8" d={PETAL_WIDE} />
            <path d="M120 130 C120 170 116 200 112 236" fill="none" stroke="#B8955A" strokeWidth="2" />
          </g>
        </svg>
        {celebrate && (
          <span
            aria-hidden="true"
            className="rsvp-fall absolute top-10 left-[100px] h-5 w-[14px] rounded-[80%_0_80%_0] bg-[#F3AFC4]"
          />
        )}
      </div>
      <h3 className="rsvp-up mt-[18px] mb-0 text-[32px] leading-[1.1] font-normal" style={delay(0.5)}>
        Que pena.
      </h3>
      <p className="rsvp-up mt-3 mb-0 max-w-[290px] text-[17px] leading-[1.55] text-deep-rose italic" style={delay(0.65)}>
        Obrigada por avisar. Se mudar de ideia até {deadlineLabel}, é só voltar por este mesmo link.
      </p>
      <div className="min-h-6 flex-1" />
      <button
        type="button"
        onClick={onEdit}
        className="rsvp-up rsvp-secondary h-[54px] w-full cursor-pointer rounded-full border border-seal bg-transparent font-sans text-[15px] font-medium tracking-[.04em] text-seal focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-wine"
        style={delay(0.8)}
      >
        Alterar resposta
      </button>
    </div>
  )
}

function ClosedView({ guest, contact }: { guest: RsvpGuestView; contact: string | null }) {
  const answer =
    guest.rsvpStatus === 'yes' ? 'Vou com certeza' : guest.rsvpStatus === 'no' ? 'Não poderei ir' : 'Sem resposta'
  const rows: [string, string][] = [['RESPOSTA', answer]]
  if (guest.rsvpStatus === 'yes') rows.push(['PESSOAS', peopleText(shownPlusOnes(guest))])
  if (contact) rows.push(['DÚVIDAS', contact])
  return (
    <div className="flex flex-1 flex-col">
      <p className="mt-3 mb-0 text-[17px] leading-[1.5] text-deep-rose italic">
        Olá, <span className="text-wine not-italic">{guest.name}</span>.{' '}
        {contact ? rsvpErrorMessage('deadline_passed') : 'O prazo para responder terminou.'}
      </p>
      <div className="mt-[22px]">
        <SummaryRows rows={rows} />
      </div>
      {guest.respondedAt && (
        <span className="mt-[10px] font-sans text-[12px] text-deep-rose">{formatRespondedAt(guest.respondedAt)}</span>
      )}
    </div>
  )
}
