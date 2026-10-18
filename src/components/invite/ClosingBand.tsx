'use client'

import { useState } from 'react'

// Gala marquee (prancha 10; prancha 03, primitive 09): two bands in opposite directions, paused on
// hover or with the button. Reduced motion: still.
const COPIES = [0, 1, 2, 3]

export function ClosingBand({ name, dateLabel }: { name: string; dateLabel: string }) {
  const [paused, setPaused] = useState(false)
  return (
    <>
      <div
        aria-hidden="true"
        className={`closing-band relative flex flex-col gap-[6px] overflow-hidden border-y border-[rgba(227,200,145,.35)] py-3${paused ? ' is-paused' : ''}`}
      >
        <div className="closing-marquee text-[46px] leading-[1.05] whitespace-nowrap text-gold-light italic">
          {COPIES.map((i) => (
            <span key={i} className="pr-[26px]">
              {name} <span className="font-script text-lily not-italic">XV</span> {dateLabel} ·
            </span>
          ))}
        </div>
        <div className="closing-marquee closing-marquee-reverse font-sans text-[11px] font-medium tracking-[.3em] whitespace-nowrap text-petal">
          {COPIES.map((i) => (
            <span key={i} className="pr-6">
              UM DIA PARA ENCERRAR UM CICLO · E COMEÇAR UMA NOVA HISTÓRIA ·
            </span>
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={() => setPaused((p) => !p)}
        aria-label={paused ? 'Retomar a faixa animada' : 'Pausar a faixa animada'}
        className="closing-pause absolute top-[150px] right-4 z-10 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-[rgba(227,200,145,.5)] bg-transparent text-gold-light focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-gold-light"
      >
        {paused ? (
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M4 2.5v9l7-4.5z" fill="currentColor" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M4 2.5v9M10 2.5v9" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        )}
      </button>
    </>
  )
}
