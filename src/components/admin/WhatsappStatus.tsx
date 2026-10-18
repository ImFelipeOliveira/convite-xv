'use client'

import {
  CircleCheck,
  MonitorSmartphone,
  QrCode,
  RefreshCw,
  Smartphone,
  TriangleAlert,
  Unplug,
} from 'lucide-react'
import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react'
import {
  connectWhatsappAction,
  logoutWhatsappAction,
  whatsappStatusAction,
} from '@/features/whatsapp/actions'
import { connectErrorMessage, type WhatsappState } from '@/features/whatsapp/connection-result'
import { useSkewGuard } from './skew-recovery'
import { Badge, type BadgeTone } from './ui/Badge'
import { Button, Spinner } from './ui/Button'
import { useToast } from './ui/Toast'

/** Status checks while the QR is up. */
const POLL_MS = 3000
/** A fresh QR is fetched only once the shown one is this old (WhatsApp rotates it ~20 s), never mid-scan. */
const QR_REFRESH_AFTER_MS = 20_000
/** Consecutive `close` answers needed before the QR counts as dead (a single one may be a blip). */
const CLOSE_STREAK_TO_EXPIRE = 2
/** After this the QR stops refreshing and the admin is offered a new one. */
const QR_LIFETIME_MS = 2 * 60 * 1000

const BADGE: Record<WhatsappState, { tone: BadgeTone; label: string }> = {
  open: { tone: 'sage', label: 'Conectado' },
  connecting: { tone: 'gold', label: 'Conectando…' },
  close: { tone: 'rose', label: 'Desconectado' },
  not_configured: { tone: 'neutral', label: 'Não configurado' },
  unavailable: { tone: 'error', label: 'Sem resposta' },
}

type Qr = { url: string; startedAt: number; expired: boolean }

const STEPS: ReactNode[] = [
  'No celular com o chip dedicado, abra o WhatsApp.',
  <>
    Toque em <strong className="font-medium">Mais opções (⋮)</strong> no Android ou em{' '}
    <strong className="font-medium">Configurações</strong> no iPhone.
  </>,
  <>
    Toque em <strong className="font-medium">Aparelhos conectados</strong> e depois em{' '}
    <strong className="font-medium">Conectar aparelho</strong>.
  </>,
  'Aponte a câmera para o QR Code desta página.',
]

function Callout({ tone, icon, children }: { tone: 'gold' | 'neutral'; icon: ReactNode; children: ReactNode }) {
  return (
    <p
      className={`flex items-start gap-3 border px-4 py-3 text-[15px] leading-snug ${
        tone === 'gold' ? 'border-gold/50 bg-gold-wash text-gold-text' : 'border-hairline bg-blush/50 text-wine'
      }`}
    >
      <span aria-hidden="true" className="mt-0.5 shrink-0">
        {icon}
      </span>
      <span>{children}</span>
    </p>
  )
}

const DEDICATED_CHIP = (
  <Callout tone="gold" icon={<TriangleAlert className="size-[18px]" strokeWidth={1.75} />}>
    Use um chip dedicado, não o número pessoal da família.
  </Callout>
)

/** Connection card of the admin WhatsApp page: connect with a QR code, check, disconnect. */
export function WhatsappStatus({ initialState }: { initialState: WhatsappState }) {
  const toast = useToast()
  const guard = useSkewGuard()
  const [state, setState] = useState<WhatsappState>(initialState)
  const [qr, setQr] = useState<Qr | null>(null)
  const [waitingHint, setWaitingHint] = useState<string | null>(null)
  const [confirmingLogout, setConfirmingLogout] = useState(false)
  const [connecting, startConnecting] = useTransition()
  const [checking, startChecking] = useTransition()
  const [loggingOut, startLoggingOut] = useTransition()
  const qrHeadingRef = useRef<HTMLHeadingElement>(null)
  const panelHeadingRef = useRef<HTMLHeadingElement>(null)
  const disconnectRef = useRef<HTMLButtonElement>(null)
  const cancelLogoutRef = useRef<HTMLButtonElement>(null)
  const connectedRef = useRef(false)

  function onConnected() {
    if (connectedRef.current) return
    connectedRef.current = true
    setQr(null)
    setWaitingHint(null)
    setState('open')
    toast.success('WhatsApp conectado!')
    requestAnimationFrame(() => panelHeadingRef.current?.focus())
  }

  // while the QR is up: check every 3 s (stops when connected, or after 2 min)
  const qrActive = qr !== null && !qr.expired
  const qrStartedAt = qr?.startedAt
  // when the QR on screen was received (initial connect or the last refresh)
  const qrFetchedAt = useRef(0)
  useEffect(() => {
    if (!qrActive || qrStartedAt === undefined) return
    let cancelled = false
    let tick = 0
    let closeStreak = 0
    let timer: ReturnType<typeof setTimeout>
    const schedule = () => {
      timer = setTimeout(run, POLL_MS)
    }
    async function run() {
      if (cancelled) return
      if (Date.now() - qrStartedAt! > QR_LIFETIME_MS) {
        setQr((q) => (q ? { ...q, expired: true } : q))
        return
      }
      tick += 1
      try {
        const result = await guard(() =>
          whatsappStatusAction(Date.now() - qrFetchedAt.current >= QR_REFRESH_AFTER_MS),
        )
        // undefined: the panel is from an older deployment and is reloading
        if (cancelled || !result) return
        if (result.state === 'open') return onConnected()
        // the first poll right after generating may still see the old `close`: ignore it
        closeStreak = result.state === 'close' && tick > 1 ? closeStreak + 1 : 0
        if (closeStreak >= CLOSE_STREAK_TO_EXPIRE) {
          // WhatsApp gave up on this pairing: a new QR is needed
          setQr((q) => (q ? { ...q, expired: true } : q))
          return
        }
        if (result.qrDataUrl) {
          qrFetchedAt.current = Date.now()
          setQr((q) => (q ? { ...q, url: result.qrDataUrl! } : q))
        }
      } catch {
        // network hiccup: keep trying until the QR lifetime ends
      }
      if (!cancelled) schedule()
    }
    schedule()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrActive, qrStartedAt])

  function connect() {
    startConnecting(async () => {
      const result = await guard(() => connectWhatsappAction())
      if (!result) return
      if (!result.ok) {
        if (result.error === 'not_configured') setState('not_configured')
        toast.error(connectErrorMessage(result.error))
        return
      }
      if (result.state === 'open') return onConnected()
      connectedRef.current = false
      setWaitingHint(null)
      setState('connecting')
      qrFetchedAt.current = Date.now()
      setQr({ url: result.qrDataUrl, startedAt: Date.now(), expired: false })
      requestAnimationFrame(() => qrHeadingRef.current?.focus())
    })
  }

  function checkNow() {
    startChecking(async () => {
      const result = await guard(() => whatsappStatusAction(false))
      if (!result) return
      if (result.state === 'open') return onConnected()
      if (result.state === 'not_configured') {
        setQr(null)
        setState('not_configured')
        return
      }
      if (result.state === 'unavailable') {
        setWaitingHint('O servidor do WhatsApp não respondeu. Tente de novo em instantes.')
        return
      }
      setWaitingHint('Ainda não conectou. Escaneie o QR Code mais recente e aguarde alguns segundos.')
    })
  }

  function retryStatus() {
    startChecking(async () => {
      const result = await guard(() => whatsappStatusAction(false))
      if (!result) return
      setState(result.state)
      if (result.state === 'unavailable') toast.error('O servidor do WhatsApp ainda não respondeu.')
    })
  }

  function cancelLogout() {
    setConfirmingLogout(false)
    requestAnimationFrame(() => disconnectRef.current?.focus())
  }

  function logout() {
    startLoggingOut(async () => {
      const result = await guard(() => logoutWhatsappAction())
      if (!result) return
      if (!result.ok) {
        toast.error('Não foi possível desconectar agora. Tente de novo.')
        return
      }
      connectedRef.current = false
      setConfirmingLogout(false)
      setState('close')
      toast.success('WhatsApp desconectado.')
      requestAnimationFrame(() => panelHeadingRef.current?.focus())
    })
  }

  useEffect(() => {
    if (confirmingLogout) cancelLogoutRef.current?.focus()
  }, [confirmingLogout])

  const badge = BADGE[state]
  const panelTitle = 'text-lg font-medium text-wine outline-none'

  let body: ReactNode
  if (qr) {
    body = (
      <div className="flex flex-col gap-6">
        {/* phones: the chip's own phone can't scan its screen */}
        <div className="sm:hidden">
          <Callout tone="neutral" icon={<MonitorSmartphone className="size-[18px]" strokeWidth={1.75} />}>
            Abra esta página em outro aparelho (computador ou outro celular) para escanear o QR Code.
          </Callout>
        </div>
        <div className="grid gap-6 md:grid-cols-[auto_minmax(0,1fr)] md:gap-10">
          <div className="relative mx-auto w-fit border border-hairline bg-white p-4 shadow-paper md:mx-0">
            {/* data URL from Evolution: next/image adds nothing here */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qr.url}
              alt="QR Code para conectar o WhatsApp"
              width={280}
              height={280}
              className={`block size-[280px] max-w-full [image-rendering:pixelated] transition-[filter,opacity] duration-(--dur-ui) ${
                qr.expired ? 'opacity-25 blur-[3px]' : ''
              }`}
            />
            {qr.expired && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                <p className="text-[15px] font-medium text-wine">O QR Code expirou.</p>
                <Button
                  onClick={connect}
                  pending={connecting}
                  pendingLabel="Gerando…"
                  icon={<RefreshCw aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />}
                >
                  Gerar novo QR Code
                </Button>
              </div>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-5">
            <div className="flex flex-col gap-2">
              <h3 ref={qrHeadingRef} tabIndex={-1} className={panelTitle}>
                Escaneie com o celular do chip
              </h3>
              <p className="text-sm text-muted">
                Abra o WhatsApp no celular › Aparelhos conectados › Conectar aparelho
              </p>
            </div>
            <ol className="flex flex-col gap-3">
              {STEPS.map((step, i) => (
                <li key={i} className="flex items-start gap-3 text-[15px] leading-snug text-wine">
                  <span
                    aria-hidden="true"
                    className="grid size-7 shrink-0 place-items-center rounded-full border border-seal/50 bg-paper text-[13px] font-medium text-seal tabular-nums"
                  >
                    {i + 1}
                  </span>
                  <span className="pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
            <p aria-live="polite" className="flex min-h-6 items-center gap-2 text-sm text-muted">
              {qr.expired ? (
                'Gere um novo QR Code para continuar.'
              ) : waitingHint ? (
                waitingHint
              ) : (
                <>
                  <Spinner className="text-seal" />
                  Aguardando a leitura do QR Code. Esta página atualiza sozinha.
                </>
              )}
            </p>
            {!qr.expired && (
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button
                  onClick={checkNow}
                  pending={checking}
                  pendingLabel="Verificando…"
                  icon={<CircleCheck aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />}
                >
                  Já escaneei
                </Button>
                <Button
                  variant="ghost"
                  onClick={connect}
                  pending={connecting}
                  pendingLabel="Gerando…"
                  icon={<RefreshCw aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />}
                >
                  Gerar novo QR Code
                </Button>
              </div>
            )}
          </div>
        </div>
        {DEDICATED_CHIP}
      </div>
    )
  } else if (state === 'open') {
    body = (
      <div className="flex flex-col gap-5">
        <div className="flex items-start gap-4">
          <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full bg-sage-wash text-sage">
            <CircleCheck className="size-5" strokeWidth={1.75} />
          </span>
          <div className="flex flex-col gap-1">
            <h3 ref={panelHeadingRef} tabIndex={-1} className={panelTitle}>
              Número conectado
            </h3>
            <p className="max-w-[56ch] text-[15px] leading-relaxed text-muted">
              Os convites e os lembretes saem por este número. Deixe o celular do chip ligado e com internet.
            </p>
          </div>
        </div>
        {confirmingLogout ? (
          <div
            role="group"
            aria-labelledby="whatsapp-logout-question"
            onKeyDown={(e) => {
              if (e.key === 'Escape' && !loggingOut) cancelLogout()
            }}
            className="flex flex-col gap-4 border border-error/30 bg-blush/60 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <p id="whatsapp-logout-question" className="text-[15px] leading-snug text-wine">
              <span className="font-medium">Desconectar este número?</span> Os convites e lembretes param de sair até
              você conectar de novo.
            </p>
            <div className="flex shrink-0 flex-col-reverse gap-2 sm:flex-row">
              <Button ref={cancelLogoutRef} variant="ghost" onClick={cancelLogout} disabled={loggingOut}>
                Cancelar
              </Button>
              <Button variant="danger" onClick={logout} pending={loggingOut} pendingLabel="Desconectando…">
                Sim, desconectar
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <Button
              ref={disconnectRef}
              variant="secondary"
              onClick={() => setConfirmingLogout(true)}
              icon={<Unplug aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />}
            >
              Desconectar
            </Button>
          </div>
        )}
      </div>
    )
  } else if (state === 'not_configured') {
    body = (
      <div className="flex flex-col gap-1">
        <h3 ref={panelHeadingRef} tabIndex={-1} className={panelTitle}>
          WhatsApp não configurado
        </h3>
        <p className="max-w-[56ch] text-[15px] leading-relaxed text-muted">
          O envio pelo WhatsApp ainda não foi ativado no servidor. Fale com o Felipe.
        </p>
      </div>
    )
  } else if (state === 'unavailable') {
    body = (
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h3 ref={panelHeadingRef} tabIndex={-1} className={panelTitle}>
            Não foi possível consultar o WhatsApp
          </h3>
          <p className="max-w-[56ch] text-[15px] leading-relaxed text-muted">
            O servidor do WhatsApp não respondeu. Tente de novo em instantes; se continuar, fale com o Felipe.
          </p>
        </div>
        <div>
          <Button
            variant="secondary"
            onClick={retryStatus}
            pending={checking}
            pendingLabel="Verificando…"
            icon={<RefreshCw aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />}
          >
            Tentar de novo
          </Button>
        </div>
      </div>
    )
  } else {
    // close, or a pairing started elsewhere that is still pending
    body = (
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h3 ref={panelHeadingRef} tabIndex={-1} className={panelTitle}>
            {state === 'connecting' ? 'Conexão em andamento' : 'Nenhum número conectado'}
          </h3>
          <p className="max-w-[56ch] text-[15px] leading-relaxed text-muted">
            {state === 'connecting'
              ? 'O WhatsApp está esperando a leitura de um QR Code. Gere um novo para conectar o chip.'
              : 'Conecte o chip da família para enviar os convites e os lembretes automáticos pelo painel.'}
          </p>
        </div>
        {DEDICATED_CHIP}
        <div>
          <Button
            onClick={connect}
            pending={connecting}
            pendingLabel="Gerando QR Code…"
            className="max-sm:w-full"
            icon={<QrCode aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />}
          >
            Conectar número
          </Button>
        </div>
      </div>
    )
  }

  return (
    <section aria-labelledby="whatsapp-status-title" className="border border-hairline bg-paper shadow-paper">
      <div className="flex items-center justify-between gap-4 border-b border-hairline px-5 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-blush text-seal">
            <Smartphone className="size-5" strokeWidth={1.5} />
          </span>
          <div className="flex min-w-0 flex-col">
            <h2 id="whatsapp-status-title" className="text-base font-medium text-wine">
              Conexão
            </h2>
            <p className="text-sm text-muted">Número que envia convites e lembretes</p>
          </div>
        </div>
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </div>
      <div className="px-5 py-6 sm:px-6">{body}</div>
    </section>
  )
}
