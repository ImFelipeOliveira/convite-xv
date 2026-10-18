'use client'

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { LilyGlyph, LilyGradients, Lily } from '@/components/ornaments/Lily'
import { WaxSeal } from '@/components/ornaments/WaxSeal'
import './opening.css'

const OPENED_KEY = 'xv:opened'
const PRESS_MS = 170
const DOORS_MS = 1700
const CROSSFADE_MS = 300

type Phase = 'closed' | 'press' | 'opening' | 'open'
// full: seal + doors · quick: "Entrar sem animação" · short: returning visitor (900 ms) · reduced: crossfade
type Mode = 'full' | 'quick' | 'short' | 'reduced'

const STAGE_CLASS: Record<Mode, string> = {
  full: 'stage stage-reveal',
  quick: 'stage stage-quick',
  short: 'stage stage-short',
  reduced: 'stage stage-quick',
}

// Runs during HTML parsing, before first paint, so returning visitors never see the doors flash.
const FLAG_RETURNING_VISITOR = `try{if(localStorage.getItem('${OPENED_KEY}')==='1')document.documentElement.setAttribute('data-xv-opened','')}catch(e){}`

function readOpened(): boolean {
  try {
    return window.localStorage.getItem(OPENED_KEY) === '1'
  } catch {
    return false
  }
}

function rememberOpened(): void {
  try {
    window.localStorage.setItem(OPENED_KEY, '1')
  } catch {
    // storage unavailable (private mode, blocked): the doors simply show again next time
  }
}

const noSubscription = () => () => {}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function Opening({
  name,
  onOpened,
  children,
}: {
  name: string
  onOpened?: () => void
  children: ReactNode
}) {
  const [state, setState] = useState<{ phase: Phase; mode: Mode }>({ phase: 'closed', mode: 'full' })
  const remembered = useSyncExternalStore(noSubscription, readOpened, () => false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const ringPathId = useId()
  const branchLilyId = useId()

  const { phase, mode } = remembered && state.phase === 'closed' ? { phase: 'open' as const, mode: 'short' as const } : state
  const opened = phase === 'opening' || phase === 'open'

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const notified = useRef(false)
  useEffect(() => {
    if (phase !== 'open' || notified.current) return
    notified.current = true
    onOpened?.()
  }, [phase, onOpened])

  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms))
  }

  const open = () => {
    if (phase !== 'closed') return
    rememberOpened()
    if (prefersReducedMotion()) {
      setState({ phase: 'opening', mode: 'reduced' })
      later(() => setState({ phase: 'open', mode: 'reduced' }), CROSSFADE_MS)
      return
    }
    setState({ phase: 'press', mode: 'full' })
    later(() => setState({ phase: 'opening', mode: 'full' }), PRESS_MS)
    later(() => setState({ phase: 'open', mode: 'full' }), DOORS_MS)
  }

  const skip = () => {
    timers.current.forEach(clearTimeout)
    rememberOpened()
    setState({ phase: 'open', mode: 'quick' })
  }

  const doorsMove = opened && mode === 'full'
  const doorClass = (side: 'left' | 'right') => `door door-${side}${doorsMove ? ' is-open' : ''}`

  return (
    <>
      <div className={opened ? STAGE_CLASS[mode] : 'stage'} inert={!opened} aria-hidden={!opened || undefined}>
        {children}
      </div>

      {phase !== 'open' && (
        <>
          <script
            type={typeof window === 'undefined' ? 'text/javascript' : 'text/plain'}
            suppressHydrationWarning
            dangerouslySetInnerHTML={{ __html: FLAG_RETURNING_VISITOR }}
          />
          <div
            className={[
              'opening-gate font-display text-wine',
              opened ? 'is-opening' : null,
              opened && mode === 'reduced' ? 'is-fading' : null,
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <div
              className={doorClass('left')}
              style={{
                background: '#FBEDEB',
                boxShadow: 'inset -18px 0 30px -22px rgba(90,33,54,.45)',
                borderRight: '1px solid rgba(184,149,90,.5)',
              }}
            >
              <div
                aria-hidden="true"
                className="absolute top-[14px] right-0 bottom-[14px] left-[14px] border border-r-0 border-[rgba(184,149,90,.6)]"
              />
              <div className="absolute top-[44px] left-[28px] flex flex-col">
                <span className="font-script text-[46px] leading-[1.1] text-rose">{name}</span>
                <span className="mt-[10px] ml-[30px] text-[12px] tracking-[.32em] text-gold-text">XV ANOS</span>
              </div>
              <div
                aria-hidden="true"
                className="absolute bottom-[48px] left-[28px] text-[150px] leading-[.8] tracking-[-.04em] text-petal italic"
              >
                XV
              </div>
            </div>

            <div
              className={doorClass('right')}
              style={{
                background: 'var(--blush)',
                boxShadow: 'inset 18px 0 30px -22px rgba(90,33,54,.45)',
                borderLeft: '1px solid rgba(184,149,90,.5)',
              }}
            >
              <div
                aria-hidden="true"
                className="absolute top-[14px] right-[14px] bottom-[14px] left-0 border border-l-0 border-[rgba(184,149,90,.6)]"
              />
              <svg
                viewBox="0 0 200 560"
                width="200"
                height="560"
                aria-hidden="true"
                className="absolute top-[150px] left-[-36px]"
              >
                <defs>
                  <LilyGradients id={branchLilyId} />
                  <g id={`${branchLilyId}-glyph`}>
                    <LilyGlyph id={branchLilyId} />
                  </g>
                </defs>
                <path
                  fill="none"
                  stroke="#B8955A"
                  strokeWidth="1.2"
                  d="M70 20 C90 40 96 70 84 100 M60 300 C30 330 24 360 40 392 M90 420 C120 450 126 480 110 520"
                />
                <ellipse cx="88" cy="52" rx="12" ry="4" fill="#C9A66B" transform="rotate(-50 88 52)" />
                <ellipse cx="34" cy="346" rx="11" ry="4" fill="#C9A66B" transform="rotate(60 34 346)" />
                <ellipse cx="120" cy="470" rx="12" ry="4" fill="#C9A66B" transform="rotate(-60 120 470)" />
                <circle cx="70" cy="20" r="2.6" fill="#D9B97E" />
                <circle cx="40" cy="392" r="2.6" fill="#D9B97E" />
                <circle cx="110" cy="520" r="2.6" fill="#D9B97E" />
                <circle cx="96" cy="74" r="1.8" fill="#D9B97E" />
                <circle cx="26" cy="370" r="1.8" fill="#D9B97E" />
                <use href={`#${branchLilyId}-glyph`} transform="translate(-6 70) scale(.72)" />
                <use href={`#${branchLilyId}-glyph`} transform="translate(40 230) rotate(24 120 130) scale(.5)" />
                <use href={`#${branchLilyId}-glyph`} transform="translate(-14 380) rotate(-12 120 130) scale(.62)" />
                <ellipse cx="128" cy="210" rx="7" ry="20" fill="#EE9DB6" transform="rotate(30 128 210)" />
                <ellipse cx="22" cy="480" rx="6" ry="17" fill="#F3AFC4" transform="rotate(-24 22 480)" />
              </svg>
              <Lily size={150} className="absolute top-[-40px] right-[-48px]" />
            </div>

            <div
              className={`absolute top-[calc(50%-70px)] left-[calc(50%-90px)] h-[180px] w-[180px]${opened ? ' is-broken' : ''}`}
            >
              <svg viewBox="0 0 180 180" width="180" height="180" aria-hidden="true" className="seal-ring absolute top-0 left-0">
                <defs>
                  <path id={ringPathId} d="M90 90 m-80 0 a80 80 0 1 1 160 0 a80 80 0 1 1 -160 0" />
                </defs>
                <text
                  fontSize="11"
                  fontWeight="500"
                  fill="#8E3556"
                  letterSpacing="3"
                  style={{ fontFamily: 'var(--font-jost), sans-serif' }}
                >
                  <textPath href={`#${ringPathId}`} textLength="496">
                    TOQUE PARA ABRIR · TOQUE PARA ABRIR ·{' '}
                  </textPath>
                </text>
              </svg>
              <button
                type="button"
                onClick={open}
                aria-label="Abrir o convite"
                className="absolute top-[30px] left-[30px] h-[120px] w-[120px] cursor-pointer rounded-full border-0 bg-transparent p-0 [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-wine"
              >
                <span
                  className={`seal-wrap absolute inset-0 block drop-shadow-[0_8px_10px_rgba(90,33,54,.35)]${phase === 'press' ? ' is-pressed' : ''}`}
                >
                  <span className="half half-left">
                    <WaxSeal size={120} />
                  </span>
                  <span className="half half-right">
                    <WaxSeal size={120} />
                  </span>
                </span>
              </button>
            </div>

            {phase === 'closed' && (
              <button
                type="button"
                onClick={skip}
                className="absolute bottom-[34px] left-1/2 h-[44px] -translate-x-1/2 cursor-pointer rounded-full border-0 bg-[rgba(255,248,246,.85)] px-[18px] font-sans text-[13px] font-medium tracking-[.04em] whitespace-nowrap text-wine [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-wine"
              >
                Entrar sem animação
              </button>
            )}
          </div>
        </>
      )}
    </>
  )
}
