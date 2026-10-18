'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  generatePixAction,
  pixStatusAction,
  type GeneratePixResult,
  type PixActionError,
  type PixStatusResult,
} from '@/features/pix/actions'
import { isValidCpf } from '@/features/pix/cpf'
import { formatCents, parseReais } from '@/features/pix/format'
import { looksLikeThousands, maskCpf, normalizeReaisInput, qrImageSrc } from '@/features/pix/input'
import { PIX_RECEIVER_NAME_DEFAULT, PIX_THANKS_MESSAGE_DEFAULT } from '@/features/pix/defaults'
import { PIX_MAX_CENTS, PIX_MIN_CENTS } from '@/features/pix/limits'
import type { PixView } from '@/features/pix/service'
import { useGiftChoice } from './GiftChoice'
import { Reveal, RevealItem } from './Reveal'
import './pix.css'

// Pix gift (prancha 09, Chapter VI). The charge is created by the server (Asaas); the QR and the
// copy-paste code only appear after it answered, and "Pix recebido." only once the server reports the
// payment as paid (status polled every 5 s for up to 30 min while the QR is open). The payer CPF lives
// only in this form's state, goes only to the action, and is cleared after a successful generation.

const VALUES = [7000, 10000, 15000, 20000, 30000]
const DEFAULT_PICK = 10000
const POLL_EVERY_MS = 5_000
const POLL_FOR_MS = 30 * 60_000
const COPIED_MS = 2_400
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-wine'

const MIN_MESSAGE = 'O valor mínimo para presentear via Pix é de R$ 70,00.'
const MAX_MESSAGE = 'O valor máximo é R$ 10.000,00.'
const THOUSANDS_HINT = 'Digite sem ponto (ex.: 1000,00).'
const CPF_MESSAGE = 'CPF inválido. Confira os números.'
const EXPIRED_MESSAGE = 'Este Pix expirou. Gere um novo.'

const GENERATE_ERRORS: Record<Exclude<PixActionError, 'below_minimum' | 'above_maximum' | 'invalid_cpf' | 'cpf_required'>, string> = {
  busy: 'Muitas solicitações agora. Tente em alguns segundos.',
  not_configured: 'Pix indisponível no momento.',
  unavailable: 'Não foi possível gerar o Pix agora.',
  not_found: 'Não foi possível gerar o Pix agora.',
  invalid: 'Não foi possível gerar o Pix agora.',
}

type Step = 'choose' | 'qr' | 'paid'

function initialStep(payment: PixView | null): Step {
  if (payment?.status === 'paid') return 'paid'
  return payment?.status === 'pending' ? 'qr' : 'choose'
}

async function generate(fd: FormData): Promise<GeneratePixResult> {
  try {
    return await generatePixAction(null, fd)
  } catch {
    // network failure: same as Asaas being down
    return { ok: false, error: 'unavailable' }
  }
}

async function copyText(text: string, input: HTMLInputElement | null): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // no clipboard permission (old browsers, some webviews): select and copy the old way
    if (!input) return false
    input.select()
    try {
      return document.execCommand('copy')
    } catch {
      return false
    }
  }
}

export function Pix({
  id,
  token,
  guestFirstName,
  requireCpf,
  thanksMessage,
  receiverName,
  initialPayment,
}: {
  id: string
  token: string
  guestFirstName: string
  requireCpf: boolean
  thanksMessage: string | null
  /** the Asaas account holder, shown under the QR ("{name} · Asaas") to match what the bank shows */
  receiverName: string | null
  /** the guest's still payable pending charge or newest paid one (server-side) */
  initialPayment: PixView | null
}) {
  const choice = useGiftChoice()
  const [step, setStep] = useState<Step>(() => initialStep(initialPayment))
  const [payment, setPayment] = useState<PixView | null>(initialPayment)
  const [pick, setPick] = useState(DEFAULT_PICK)
  const [custom, setCustom] = useState(false)
  const [raw, setRaw] = useState('')
  const [touched, setTouched] = useState(false)
  const [cpf, setCpf] = useState('')
  const [cpfError, setCpfError] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<'ok' | 'failed' | null>(null)
  const [celebrate, setCelebrate] = useState(false)
  const [announce, setAnnounce] = useState('')
  // polling gave up (30 min, or the charge is gone): the guest can still ask once
  const [pollStopped, setPollStopped] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const paidTitleRef = useRef<HTMLHeadingElement>(null)
  const amountRef = useRef<HTMLInputElement>(null)
  const cpfRef = useRef<HTMLInputElement>(null)
  const codeRef = useRef<HTMLInputElement>(null)
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // "1.000" (dots only) is ambiguous: ask to type it without dots instead of guessing (never R$ 1,00)
  const thousandsHint = custom && looksLikeThousands(raw)
  const customCents = thousandsHint ? null : parseReais(raw)
  const cents = custom ? customCents : pick
  const valid = cents !== null && cents >= PIX_MIN_CENTS && cents <= PIX_MAX_CENTS
  const amountError = !custom
    ? null
    : thousandsHint
      ? THOUSANDS_HINT
      : touched && !valid
        ? cents !== null && cents > PIX_MAX_CENTS
          ? MAX_MESSAGE
          : MIN_MESSAGE
        : null

  useEffect(() => () => clearTimeout(copiedTimer.current), [])

  function expireCharge() {
    setPayment(null)
    setStep('choose')
    setError(EXPIRED_MESSAGE)
  }

  /** A status answer while the QR is open; true when the charge is settled (paid or gone). */
  function applyStatus(res: PixStatusResult, amountCents: number | undefined): boolean {
    if (!res.ok) return false
    if (res.status === 'paid') {
      setPayment((p) => (p ? { ...p, status: 'paid', paidAt: res.paidAt } : p))
      setCelebrate(true)
      setStep('paid')
      setAnnounce('Pix recebido. Muito obrigada!')
      if (amountCents !== undefined) choice?.setPixPaid(amountCents)
      // the QR step (and the focused control in it) is gone: land on the thanks
      requestAnimationFrame(() => paidTitleRef.current?.focus())
      return true
    }
    if (res.status !== 'pending') {
      expireCharge()
      return true
    }
    return false
  }

  // while the QR is open: ask the server every 5 s (up to 30 min) until the charge is settled
  const pollingId = step === 'qr' && !pollStopped ? payment?.id : undefined
  const expiresAt = payment?.expiresAt
  const paidAmount = payment?.amountCents
  useEffect(() => {
    if (!pollingId) return
    const startedAt = Date.now()
    let stopped = false
    let busy = false
    const stop = () => {
      stopped = true
      clearInterval(timer)
    }
    const giveUp = () => {
      stop()
      setPollStopped(true)
    }
    const tick = async () => {
      if (stopped || busy) return
      if (Date.now() - startedAt > POLL_FOR_MS) return giveUp()
      if (expiresAt && Date.now() >= new Date(expiresAt).getTime()) {
        stop()
        return expireCharge()
      }
      busy = true
      try {
        const res = await pixStatusAction(token, pollingId)
        if (stopped) return
        if (!res.ok && res.error === 'not_found') return giveUp()
        if (applyStatus(res, paidAmount)) stop()
      } catch {
        // offline for a moment: the next tick tries again
      } finally {
        busy = false
      }
    }
    const timer = setInterval(tick, POLL_EVERY_MS)
    return stop
    // `choice` / the helpers are fresh every render: the poll only restarts for another charge
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollingId, expiresAt, paidAmount, token])

  /** After polling gave up: one status call on demand. */
  async function verify() {
    if (!payment || verifying) return
    setVerifying(true)
    try {
      applyStatus(await pixStatusAction(token, payment.id), payment.amountCents)
    } catch {
      // offline: the button stays
    } finally {
      setVerifying(false)
    }
  }

  function focusTitle() {
    requestAnimationFrame(() => titleRef.current?.focus())
  }

  function choosePick(value: number) {
    setPick(value)
    setCustom(false)
    setTouched(false)
    setError(null)
  }

  function chooseCustom() {
    setCustom(true)
    setError(null)
    requestAnimationFrame(() => amountRef.current?.focus())
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (generating) return
    setError(null)
    if (!valid || cents === null) {
      setCustom(true)
      setTouched(true)
      requestAnimationFrame(() => amountRef.current?.focus())
      return
    }
    if (requireCpf && !isValidCpf(cpf)) {
      setCpfError(true)
      cpfRef.current?.focus()
      return
    }
    setGenerating(true)
    const fd = new FormData()
    fd.set('token', token)
    fd.set('amount', String(cents))
    if (requireCpf) fd.set('cpf', cpf)
    const result = await generate(fd)
    setGenerating(false)
    if (result.ok) {
      setCpf('')
      setCpfError(false)
      setCopied(null)
      setPollStopped(false)
      setPayment(result.payment)
      setStep('qr')
      focusTitle()
      return
    }
    if (result.error === 'below_minimum' || result.error === 'above_maximum') {
      setCustom(true)
      setTouched(true)
    } else if (result.error === 'invalid_cpf' || result.error === 'cpf_required') {
      setCpfError(true)
      cpfRef.current?.focus()
    } else {
      setError(GENERATE_ERRORS[result.error])
    }
  }

  async function copy() {
    if (!payment?.copyPaste) return
    const ok = await copyText(payment.copyPaste, codeRef.current)
    setCopied(ok ? 'ok' : 'failed')
    clearTimeout(copiedTimer.current)
    if (ok) copiedTimer.current = setTimeout(() => setCopied(null), COPIED_MS)
  }

  function changeAmount() {
    setStep('choose')
    setCopied(null)
    setError(null)
    focusTitle()
  }

  function restart() {
    setStep('choose')
    setPayment(null)
    setPick(DEFAULT_PICK)
    setCustom(false)
    setRaw('')
    setTouched(false)
    setCelebrate(false)
    setError(null)
    focusTitle()
  }

  const titleId = `${id}-title`
  const amountId = `${id}-amount`
  const amountHelpId = `${id}-amount-help`
  const cpfId = `${id}-cpf`
  const cpfHelpId = `${id}-cpf-help`
  const codeId = `${id}-code`
  const shownCents = step === 'choose' ? cents : (payment?.amountCents ?? null)
  const amountText = shownCents !== null ? formatCents(shownCents) : 'R$ —'

  return (
    <Reveal as="section" id={id} aria-labelledby={titleId} className="relative overflow-hidden bg-blush font-display text-wine">
      <div aria-hidden="true" className="pointer-events-none absolute inset-[14px] border border-[rgba(184,149,90,.75)]" />
      <div className="relative flex flex-col px-7 pt-[52px] pb-10">
        <RevealItem className="flex flex-col">
          <div className="flex min-h-[26px] items-center justify-between gap-3">
            <span className="font-sans text-[11px] font-medium tracking-[.26em] text-gold-text">CAPÍTULO VI</span>
            {step !== 'choose' && <StatusBadge paid={step === 'paid'} />}
          </div>
          <h2
            id={titleId}
            ref={titleRef}
            tabIndex={-1}
            className="mt-[14px] mb-0 text-[40px] leading-none font-normal tracking-[-.02em] outline-none"
          >
            Um presente <span className="font-script text-[48px] text-rose">em</span> Pix.
          </h2>
        </RevealItem>

        <p role="status" aria-live="polite" className="sr-only">
          {announce}
        </p>

        {/* one always-mounted item: swapping steps never re-runs the scroll reveal */}
        <RevealItem className="flex flex-col">
          {/* post + no `name` on any input: even a submit before hydration never puts the CPF in a URL */}
          {step === 'choose' && (
            <form method="post" noValidate onSubmit={onSubmit} className="pix-swap flex flex-col">
              <p className="mt-3 mb-0 text-[17px] leading-[1.5] text-deep-rose italic">
                Se preferir presentear assim, escolha um valor. Sem pressa e sem obrigação — o carinho é o que conta.
              </p>

              <fieldset className="m-0 mt-6 border-0 p-0">
                <legend className="mb-3 p-0 font-sans text-[11px] font-medium tracking-[.22em] text-gold-text">
                  ESCOLHA UM VALOR
                </legend>
                <div className="flex flex-wrap gap-[10px]">
                  {VALUES.map((v) => {
                    const on = !custom && pick === v
                    return (
                      <button
                        key={v}
                        type="button"
                        aria-pressed={on}
                        onClick={() => choosePick(v)}
                        className={`pix-chip h-12 cursor-pointer rounded-full border px-[18px] font-display text-[18px] ${FOCUS} ${
                          on ? 'border-wine bg-wine text-paper' : 'border-[rgba(184,149,90,.9)] bg-paper text-wine'
                        }`}
                      >
                        R$ {v / 100}
                      </button>
                    )
                  })}
                  <button
                    type="button"
                    aria-pressed={custom}
                    onClick={chooseCustom}
                    className={`pix-chip h-12 cursor-pointer rounded-full border px-[18px] font-sans text-[14px] ${FOCUS} ${
                      custom ? 'border-wine bg-wine text-paper' : 'border-[rgba(184,149,90,.9)] bg-transparent text-wine'
                    }`}
                  >
                    Outro valor
                  </button>
                </div>
              </fieldset>

              {custom && (
                <div className="pix-swap mt-[18px] flex flex-col gap-2">
                  <label htmlFor={amountId} className="font-sans text-[11px] font-medium tracking-[.22em] text-gold-text">
                    OUTRO VALOR
                  </label>
                  <div className="relative">
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-0 left-4 flex items-center font-sans text-[16px] text-deep-rose"
                    >
                      R$
                    </span>
                    <input
                      ref={amountRef}
                      id={amountId}
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="70,00"
                      value={raw}
                      onChange={(e) => {
                        const typed = e.target.value
                        setRaw(normalizeReaisInput(typed))
                        setError(null)
                      }}
                      onBlur={() => {
                        setTouched(true)
                        if (looksLikeThousands(raw)) return
                        if (/^[\d.]+$/.test(raw)) setRaw(`${raw},00`)
                        else if (/,\d$/.test(raw)) setRaw(`${raw}0`)
                      }}
                      aria-invalid={amountError !== null}
                      aria-describedby={amountHelpId}
                      className={`box-border h-14 w-full rounded-[2px] border bg-paper pr-4 pl-12 font-sans text-[18px] text-wine placeholder:text-muted ${FOCUS} ${
                        amountError ? 'border-error' : 'border-[rgba(184,149,90,.8)]'
                      }`}
                    />
                  </div>
                  {amountError ? (
                    <span
                      id={amountHelpId}
                      role="alert"
                      className="pix-shake flex items-start gap-[6px] font-sans text-[13px] leading-[1.4] text-error"
                    >
                      <AlertIcon />
                      {amountError}
                    </span>
                  ) : (
                    <span id={amountHelpId} className="font-sans text-[12px] text-deep-rose">
                      A partir de R$ 70,00.
                    </span>
                  )}
                </div>
              )}

              {requireCpf && (
                <div className="mt-[18px] flex flex-col gap-2">
                  <label htmlFor={cpfId} className="font-sans text-[13px] font-medium tracking-[.02em] text-wine">
                    CPF de quem vai pagar
                  </label>
                  <input
                    ref={cpfRef}
                    id={cpfId}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="000.000.000-00"
                    maxLength={14}
                    value={cpf}
                    onChange={(e) => {
                      setCpf(maskCpf(e.target.value))
                      setCpfError(false)
                    }}
                    aria-invalid={cpfError}
                    aria-describedby={cpfHelpId}
                    className={`box-border h-14 w-full rounded-[2px] border bg-paper px-4 font-sans text-[18px] tracking-[.04em] text-wine placeholder:text-muted ${FOCUS} ${
                      cpfError ? 'border-error' : 'border-[rgba(184,149,90,.8)]'
                    }`}
                  />
                  {cpfError ? (
                    <span
                      id={cpfHelpId}
                      role="alert"
                      className="pix-shake flex items-start gap-[6px] font-sans text-[13px] leading-[1.4] text-error"
                    >
                      <AlertIcon />
                      {CPF_MESSAGE}
                    </span>
                  ) : (
                    <span id={cpfHelpId} className="font-sans text-[12px] leading-[1.45] text-deep-rose">
                      Usado só para gerar o Pix no Asaas.
                    </span>
                  )}
                </div>
              )}

              <div className="mt-6 flex items-baseline justify-between gap-4 border-y border-[rgba(184,149,90,.6)] py-[18px]">
                <span className="font-sans text-[11px] font-medium tracking-[.22em] text-gold-text">SEU PRESENTE</span>
                <span
                  key={amountText}
                  data-testid="pix-amount"
                  className={`pix-amount text-[40px] leading-none ${valid ? 'text-wine' : 'text-[#9C6B7D]'}`}
                >
                  {amountText}
                </span>
              </div>
              <div className="flex justify-between gap-4 border-b border-[rgba(184,149,90,.6)] py-3 font-sans text-[14px]">
                <span className="pt-[2px] text-[11px] font-medium tracking-[.2em] text-gold-text">DE</span>
                <span data-testid="pix-from" className="text-right">
                  {guestFirstName}
                </span>
              </div>

              {error && (
                <p role="alert" className="mt-4 mb-0 font-sans text-[13px] leading-[1.45] text-error">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={generating}
                aria-busy={generating}
                className={`pix-cta mt-[26px] flex h-[54px] cursor-pointer items-center justify-center gap-3 rounded-full border-0 font-sans text-[15px] font-medium tracking-[.04em] ${FOCUS} ${
                  valid ? 'bg-seal text-paper' : 'bg-[#EBCFD2] text-muted'
                }`}
              >
                {generating && <span className="pix-spin" aria-hidden="true" />}
                <span>{generating ? 'Gerando Pix…' : 'Gerar Pix'}</span>
              </button>
              <p className="mt-3 mb-0 text-center font-sans text-[12px] leading-[1.5] text-deep-rose">
                O código Pix é gerado com segurança pelo servidor.
              </p>
            </form>
          )}

          {step === 'qr' && payment && (
            <div className="pix-swap flex flex-col items-center text-center">
              <div className="mt-4 text-[44px] leading-none">{amountText}</div>

              {payment.qrImage && qrImageSrc(payment.qrImage) && (
                <div className="pix-qr relative mt-5 box-border size-[224px] border border-gold bg-paper p-[14px] outline-1 outline-offset-[6px] outline-[rgba(184,149,90,.4)] outline-solid">
                  {/* base64 PNG from Asaas: next/image adds nothing here */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrImageSrc(payment.qrImage) ?? undefined}
                    alt={`QR Code Pix de ${amountText}`}
                    width={194}
                    height={194}
                    className="block size-full [image-rendering:pixelated]"
                  />
                </div>
              )}
              <p data-testid="pix-receiver" className="mt-[18px] mb-0 font-sans text-[12px] leading-[1.5] text-gold-text">
                {receiverName?.trim() || PIX_RECEIVER_NAME_DEFAULT} · Asaas
              </p>

              {payment.copyPaste && (
                <div className="mt-6 flex w-full flex-col gap-2 text-left">
                  <label htmlFor={codeId} className="font-sans text-[11px] font-medium tracking-[.22em] text-gold-text">
                    PIX COPIA E COLA
                  </label>
                  <div className="flex gap-2">
                    <input
                      ref={codeRef}
                      id={codeId}
                      type="text"
                      readOnly
                      value={payment.copyPaste}
                      onFocus={(e) => e.currentTarget.select()}
                      className={`box-border h-[52px] min-w-0 flex-1 rounded-[2px] border border-[rgba(184,149,90,.8)] bg-paper px-[14px] font-mono text-[12px] text-wine ${FOCUS}`}
                    />
                    <button
                      type="button"
                      onClick={copy}
                      className={`pix-cta flex h-[52px] w-[112px] flex-none cursor-pointer items-center justify-center gap-[6px] rounded-full border-0 font-sans text-[14px] font-medium text-paper ${FOCUS} ${
                        copied === 'ok' ? 'bg-sage' : 'bg-seal'
                      }`}
                    >
                      {copied === 'ok' && (
                        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                          <path
                            className="pix-tick"
                            pathLength={1}
                            d="M3 8.4l3.2 3.2L13 4.6"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                          />
                        </svg>
                      )}
                      <span>{copied === 'ok' ? 'Copiado' : 'Copiar'}</span>
                    </button>
                  </div>
                  <span
                    role="status"
                    aria-live="polite"
                    className={`min-h-4 font-sans text-[12px] ${copied === 'failed' ? 'text-error' : 'text-sage'}`}
                  >
                    {copied === 'ok' && <span className="pix-copied">Código copiado. Agora é só colar no app do banco.</span>}
                    {copied === 'failed' && 'Não deu para copiar. Toque no código e copie manualmente.'}
                  </span>
                </div>
              )}

              <ol className="m-0 mt-[6px] w-full list-none p-0 text-left font-sans text-[14px] leading-[1.45]">
                {[
                  'Abra o app do seu banco e escolha Pix.',
                  'Leia o QR Code ou cole o código copiado.',
                  'Confira o valor e o nome do recebedor antes de pagar.',
                ].map((text, i) => (
                  <li
                    key={text}
                    className={`flex gap-[14px] border-t border-[rgba(184,149,90,.6)] py-[10px] ${i === 2 ? 'border-b' : ''}`}
                  >
                    <span aria-hidden="true" className="w-4 flex-none font-display text-[20px] leading-none text-rose italic">
                      {i + 1}
                    </span>
                    {text}
                  </li>
                ))}
              </ol>

              {pollStopped ? (
                <div className="mt-[14px] flex w-full flex-col items-center gap-2">
                  <p className="m-0 font-sans text-[13px] leading-[1.5] text-deep-rose">Já pagou? Toque para verificar.</p>
                  <button
                    type="button"
                    onClick={verify}
                    disabled={verifying}
                    aria-busy={verifying}
                    className={`flex h-[48px] w-full cursor-pointer items-center justify-center rounded-full border border-seal bg-transparent font-sans text-[15px] font-medium text-seal ${FOCUS}`}
                  >
                    {verifying ? 'Verificando…' : 'Verificar pagamento'}
                  </button>
                </div>
              ) : (
                <p className="mt-[14px] mb-0 text-left font-sans text-[13px] leading-[1.5] text-deep-rose">
                  A confirmação aparece aqui sozinha quando o banco avisar. Pode fechar a página: nada é cobrado duas vezes.
                </p>
              )}

              <button
                type="button"
                onClick={changeAmount}
                className={`mt-[6px] h-11 cursor-pointer border-0 bg-transparent font-sans text-[14px] font-medium text-deep-rose underline decoration-[rgba(184,149,90,.8)] underline-offset-[5px] ${FOCUS}`}
              >
                Trocar o valor
              </button>
            </div>
          )}

          {step === 'paid' && payment && (
            <div
              data-celebrate={celebrate ? '' : undefined}
              className="pix-paid flex flex-col items-center pt-10 text-center"
            >
              <svg
                className="pix-stamp drop-shadow-[0_10px_12px_rgba(90,33,54,.3)]"
                viewBox="0 0 160 160"
                width="150"
                height="150"
                aria-hidden="true"
              >
                <defs>
                  <radialGradient id={`${id}-seal`} cx=".4" cy=".35" r=".75">
                    <stop offset="0" stopColor="#D0588A" />
                    <stop offset=".6" stopColor="#A8325E" />
                    <stop offset="1" stopColor="#7A1F43" />
                  </radialGradient>
                </defs>
                <path
                  fill={`url(#${id}-seal)`}
                  d="M80 8 C98 6 112 14 124 22 C138 30 150 44 152 62 C156 78 154 96 146 110 C140 124 128 140 110 148 C96 154 78 156 62 150 C44 146 28 134 18 118 C8 102 6 84 10 66 C12 48 24 32 38 22 C50 12 64 8 80 8 Z"
                />
                <circle
                  className="pix-ring"
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
                  className="pix-check"
                  pathLength={1}
                  d="M58 81 L74 97 L104 64"
                  fill="none"
                  stroke="#FFF8F6"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <h3
                ref={paidTitleRef}
                tabIndex={-1}
                className="pix-rise mt-[26px] mb-0 text-[32px] leading-[1.1] font-normal outline-none"
                style={{ animationDelay: '.9s' }}
              >
                Pix recebido.
              </h3>
              <div
                className="pix-rise mt-1 font-script text-[50px] leading-[1.1] text-rose"
                style={{ animationDelay: '1.05s' }}
              >
                Muito obrigada!
              </div>
              <div className="pix-rise mt-[14px] text-[30px] leading-none" style={{ animationDelay: '1.15s' }}>
                {amountText}
              </div>
              <p
                className="pix-rise mt-4 mb-0 max-w-[300px] text-[17px] leading-[1.55] whitespace-pre-line text-deep-rose italic"
                style={{ animationDelay: '1.25s' }}
              >
                {thanksMessage?.trim() || PIX_THANKS_MESSAGE_DEFAULT}
              </p>
              <p
                className="pix-rise mt-3 mb-0 max-w-[300px] font-sans text-[12px] leading-[1.5] text-gold-text"
                style={{ animationDelay: '1.35s' }}
              >
                Pagamento confirmado pelo banco.
              </p>
              <button
                type="button"
                onClick={restart}
                className={`pix-rise mt-7 h-[54px] w-full cursor-pointer rounded-full border border-seal bg-transparent font-sans text-[15px] font-medium text-seal ${FOCUS}`}
                style={{ animationDelay: '1.45s' }}
              >
                Enviar outro Pix
              </button>
            </div>
          )}
        </RevealItem>
      </div>
    </Reveal>
  )
}

function StatusBadge({ paid }: { paid: boolean }) {
  return (
    <span
      className={`flex h-[26px] items-center gap-[6px] rounded-full border px-[10px] font-sans text-[10px] font-medium tracking-[.14em] ${
        paid ? 'border-sage bg-sage text-paper' : 'border-gold-text bg-transparent text-gold-text'
      }`}
    >
      {!paid && (
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path className="pix-clock" d="M6 6V3.2" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      )}
      {paid ? 'PAGO' : 'AGUARDANDO PAGAMENTO'}
    </span>
  )
}

function AlertIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="mt-[2px] flex-none">
      <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M7 3.6v4.2M7 9.6v.8" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

/** Flag on but Asaas not configured: the chapter stays (Closing links to #pix) without a form. */
export function PixUnavailable({ id }: { id: string }) {
  const titleId = `${id}-title`
  return (
    <Reveal as="section" id={id} aria-labelledby={titleId} className="relative overflow-hidden bg-blush font-display text-wine">
      <div aria-hidden="true" className="pointer-events-none absolute inset-[14px] border border-[rgba(184,149,90,.75)]" />
      <div className="relative flex flex-col px-7 pt-[52px] pb-10">
        <RevealItem className="flex flex-col">
          <span className="font-sans text-[11px] font-medium tracking-[.26em] text-gold-text">CAPÍTULO VI</span>
          <h2 id={titleId} className="mt-[14px] mb-0 text-[40px] leading-none font-normal tracking-[-.02em]">
            Um presente <span className="font-script text-[48px] text-rose">em</span> Pix.
          </h2>
          <p className="mt-3 mb-0 text-[17px] leading-[1.5] text-deep-rose italic">Pix indisponível no momento.</p>
        </RevealItem>
      </div>
    </Reveal>
  )
}
