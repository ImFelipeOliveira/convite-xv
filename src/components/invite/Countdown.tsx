'use client'

import { useEffect, useState } from 'react'
import { RevealItem } from './Reveal'
import { countdownParts } from './countdown-parts'

export { countdownParts } from './countdown-parts'

// Odometer countdown (prancha 06; prancha 03, primitive 07): each digit is a 0–9 ribbon that rolls,
// and only the digits that change move. Reduced motion: dry swap and no seconds (the-day.css hides
// `.countdown-seconds`). When the time is up it reads "É hoje".
const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']

function Digit({ value }: { value: string }) {
  return (
    <span className="block h-[1em] w-[.62em] overflow-hidden text-center">
      <span
        className="flex flex-col transition-transform duration-[600ms] ease-(--ease-letter)"
        style={{ transform: `translateY(-${value}em)` }}
      >
        {DIGITS.map((d) => (
          <span key={d} className="h-[1em]">
            {d}
          </span>
        ))}
      </span>
    </span>
  )
}

function Unit({ value, label, first, className }: { value: number; label: string; first?: boolean; className?: string }) {
  return (
    <div className={`flex items-start gap-[6px] ${className ?? ''}`}>
      {!first && (
        <span aria-hidden="true" className="text-[40px] leading-[1.1] text-[rgba(107,74,34,.55)]">
          :
        </span>
      )}
      <div aria-hidden="true" className="flex w-[62px] flex-col items-center gap-2">
        <div className="flex text-[50px] leading-none text-wine [font-variant-numeric:lining-nums]">
          {String(value)
            .padStart(2, '0')
            .split('')
            .map((d, i) => (
              <Digit key={i} value={d} />
            ))}
        </div>
        <span className="font-sans text-[10px] font-medium tracking-[.22em] text-[#6B4A22]">{label}</span>
      </div>
    </div>
  )
}

export function Countdown({ targetIso, initialNow }: { targetIso: string; initialNow: number }) {
  // starts from the server's clock so the first client render matches the HTML
  const [now, setNow] = useState(initialNow)

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const { days, hours, minutes, seconds, finished } = countdownParts(targetIso, now)

  if (finished) {
    return (
      <RevealItem className="mt-6 font-script text-[64px] leading-none text-seal" delay={0.5}>
        É hoje
      </RevealItem>
    )
  }

  return (
    <div className="flex flex-col items-center">
      <RevealItem className="mt-5 font-script text-[62px] leading-none text-seal" delay={0.5}>
        Faltam
      </RevealItem>
      <RevealItem delay={0.6}>
        <div
          role="timer"
          aria-label={`Faltam ${days} dias, ${hours} horas e ${minutes} minutos`}
          className="mt-[14px] flex items-start gap-[6px]"
        >
          <Unit value={days} label="DIAS" first />
          <Unit value={hours} label="HORAS" />
          <Unit value={minutes} label="MIN" />
          <Unit value={seconds} label="SEG" className="countdown-seconds" />
        </div>
      </RevealItem>
    </div>
  )
}
