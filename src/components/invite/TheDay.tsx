import { GemDivider } from '@/components/ornaments/GemDivider'
import { WaxSeal } from '@/components/ornaments/WaxSeal'
import { EVENT } from '@/features/event/event'
import { Countdown } from './Countdown'
import { Reveal, RevealItem } from './Reveal'
import './the-day.css'

// The day (prancha 06): Chapter II — date, odometer and calendar link under the arch;
// Chapter III — venue, map links, contact and the dress code card.
const SUN_RAYS = Array.from({ length: 24 }, (_, i) => i * 15)
const WAVE =
  'M0 12 Q10 6 20 12 ' +
  Array.from({ length: 39 }, (_, i) => `T${(i + 2) * 20} 12`).join(' ')

const gold = 'rgba(184,149,90,.9)'

/** "…bem. Traje de banho é indispensável." → the card text and the highlighted last sentence. */
function splitDressCode(text: string): [string, string] {
  const cut = text.lastIndexOf('. ', text.length - 2)
  return cut === -1 ? ['', text] : [text.slice(0, cut + 1), text.slice(cut + 2)]
}

function SideLabel({ children }: { children: string }) {
  return (
    <span
      className="border-y py-[10px] font-sans text-[15px] font-medium text-wine"
      style={{ borderColor: gold, letterSpacing: children === 'DOM' ? '.22em' : '.16em' }}
    >
      {children}
    </span>
  )
}

export function TheDay({
  token,
  contactInfo,
  now,
}: {
  token: string
  contactInfo: string | null
  now: number
}) {
  const [dressText, dressHighlight] = splitDressCode(EVENT.dressCode.text)
  const { venue } = EVENT

  return (
    <div className="bg-blush font-display text-wine">
      <Reveal
        as="section"
        id="the-day"
        aria-labelledby="the-day-title"
        className="relative mt-9 overflow-hidden rounded-t-[min(50vw,240px)] bg-petal px-7 pt-[84px] pb-[72px]"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-3 right-3 bottom-[-2px] left-3 rounded-t-[calc(min(50vw,240px)-12px)] border border-b-0 border-[rgba(184,149,90,.8)]"
        />

        <div className="relative flex flex-col items-center text-center">
          <RevealItem className="font-sans text-[11px] font-medium tracking-[.26em] text-[#6B4A22]" delay={0}>
            CAPÍTULO II
          </RevealItem>
          <RevealItem delay={0.08}>
            <h2 id="the-day-title" className="mt-[10px] text-[44px] leading-none font-normal tracking-[-.02em]">
              O dia.
            </h2>
          </RevealItem>

          <GemDivider className="mt-7" delay={0.3} />

          <RevealItem className="relative z-[1] mt-[18px] text-[22px] tracking-[.32em] text-[#6B4A22]" delay={0.2}>
            DEZEMBRO
          </RevealItem>
          <div className="relative mt-1 w-full">
            <RevealItem
              kind="fade"
              delay={0.2}
              className="pointer-events-none absolute top-1/2 left-1/2 -mt-[150px] -ml-[150px] h-[300px] w-[300px]"
            >
              <svg className="the-day-sun" viewBox="0 0 300 300" width="300" height="300" aria-hidden="true">
                <circle cx="150" cy="150" r="82" fill="#FBE6E2" />
                <circle cx="150" cy="150" r="82" fill="none" stroke="#B8955A" strokeOpacity=".6" strokeWidth="1" />
                <g stroke="#B8955A" strokeOpacity=".55" strokeWidth="1" strokeLinecap="round">
                  {SUN_RAYS.map((angle, i) => (
                    <line
                      key={angle}
                      x1="150"
                      y1="58"
                      x2="150"
                      y2={i % 2 === 0 ? 8 : 30}
                      transform={`rotate(${angle} 150 150)`}
                    />
                  ))}
                </g>
              </svg>
            </RevealItem>
            <RevealItem delay={0.3}>
              <p
                className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-[14px]"
              >
                <SideLabel>DOM</SideLabel>
                <span className="pr-[10px] text-[150px] leading-[.86] tracking-[-.04em] text-seal italic">27</span>
                <SideLabel>10H00</SideLabel>
              </p>
            </RevealItem>
          </div>
          <RevealItem className="relative z-[1] mt-[6px] text-[22px] tracking-[.32em] text-[#6B4A22]" delay={0.38}>
            2026
          </RevealItem>

          <GemDivider className="mt-[22px]" delay={0.5} />

          <Countdown targetIso={EVENT.startsAt} initialNow={now} />

          <RevealItem className="mt-[30px] flex flex-col items-center gap-[10px]" delay={0.8}>
            <a
              href={`/c/${token}/calendar.ics`}
              className="flex items-center gap-2 border-b border-gold pt-3 pb-[3px] font-sans text-[15px] font-medium text-wine no-underline hover:text-wine focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-wine"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <rect x="2" y="3" width="12" height="11" fill="none" stroke="currentColor" strokeWidth="1.2" />
                <path d="M2 6.5h12M5 1.5v3M11 1.5v3" stroke="currentColor" strokeWidth="1.2" />
              </svg>
              Adicionar à agenda
            </a>
            <span className="font-sans text-[12px] text-deep-rose">Horário de Roraima</span>
          </RevealItem>
        </div>
      </Reveal>

      <Reveal
        as="section"
        id="venue"
        aria-labelledby="venue-title"
        className="relative flex flex-col gap-5 px-7 pt-14 pb-[42px]"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 right-[14px] bottom-[14px] left-[14px] border border-t-0 border-[rgba(184,149,90,.6)]"
        />
        <RevealItem className="relative flex flex-col gap-2">
          <span className="font-sans text-[11px] font-medium tracking-[.26em] text-gold-text">CAPÍTULO III · ONDE</span>
          <h2 id="venue-title" className="m-0 text-[34px] leading-[1.1] font-normal tracking-[-.01em]">
            {venue.name}.
          </h2>
          <p className="m-0 font-sans text-[15px] leading-[1.55] text-deep-rose">
            {venue.address}
            <br />
            {venue.city}
          </p>
        </RevealItem>

        <RevealItem
          className="relative h-[168px] overflow-hidden border border-[rgba(184,149,90,.75)] bg-paper"
          style={{
            backgroundImage:
              'repeating-linear-gradient(28deg,transparent 0 38px,rgba(184,149,90,.28) 38px 39px),repeating-linear-gradient(-62deg,transparent 0 54px,rgba(184,149,90,.28) 54px 55px)',
          }}
        >
          <div role="img" aria-label="Prévia do mapa: Sítio Lua Azul, na BR-401, em Cantá" className="absolute inset-0">
            <span
              aria-hidden="true"
              className="absolute top-[92px] right-[-20px] left-[-20px] h-3 rotate-[-8deg] bg-[rgba(240,199,198,.9)]"
            />
            <span
              aria-hidden="true"
              className="absolute top-[118px] left-4 rotate-[-8deg] font-sans text-[10px] font-medium tracking-[.16em] text-gold-text"
            >
              BR-401
            </span>
            <WaxSeal size={54} className="absolute top-[34px] left-[54%] drop-shadow-[0_6px_6px_rgba(90,33,54,.3)]" />
            <span className="absolute right-[10px] bottom-2 font-sans text-[10px] tracking-[.14em] text-gold-text">
              KM 13 · CANTÁ
            </span>
          </div>
        </RevealItem>

        <RevealItem className="relative flex gap-3">
          <a
            href={venue.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="the-day-button flex h-[52px] flex-1 items-center justify-center gap-2 rounded-full border border-seal font-sans text-[15px] font-medium text-seal no-underline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-wine"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M8 15s5-4.6 5-8.6A5 5 0 0 0 3 6.4C3 10.4 8 15 8 15z" fill="none" stroke="currentColor" strokeWidth="1.3" />
              <circle cx="8" cy="6.5" r="1.8" fill="none" stroke="currentColor" strokeWidth="1.3" />
            </svg>
            Google Maps
          </a>
          <a
            href={venue.wazeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="the-day-button flex h-[52px] flex-1 items-center justify-center rounded-full border border-seal font-sans text-[15px] font-medium text-seal no-underline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-wine"
          >
            Waze
          </a>
        </RevealItem>

        {contactInfo && (
          <RevealItem className="relative flex justify-between gap-4 border-y border-[rgba(184,149,90,.6)] py-[14px] font-sans text-[14px]">
            <span className="pt-[2px] text-[11px] font-medium tracking-[.16em] text-gold-text">DÚVIDAS</span>
            <span className="text-right whitespace-pre-line text-wine">{contactInfo}</span>
          </RevealItem>
        )}

        <RevealItem className="relative mt-[6px] overflow-hidden border border-[rgba(184,149,90,.8)] bg-paper px-5 pt-5">
          <div className="flex items-start gap-4">
            <svg viewBox="0 0 64 64" width="56" height="56" aria-hidden="true" className="mt-[6px] flex-none">
              <path
                d="M23 6 L25 21 C25 26 20 29 20 36 L20 50 C26 51 30 55 32 58 C34 55 38 51 44 50 L44 36 C44 29 39 26 39 21 L41 6"
                fill="none"
                stroke="#C25578"
                strokeWidth="1.5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <path d="M25 21 C29 26 35 26 39 21" fill="none" stroke="#C25578" strokeWidth="1.5" />
              <path d="M20 42 C26 40 38 40 44 42" fill="none" stroke="#B8955A" strokeWidth="1.2" />
            </svg>
            <div className="flex flex-col gap-[2px]">
              <h3 className="m-0 font-script text-[44px] leading-none font-normal text-rose">Traje</h3>
              <p className="m-0 text-[24px] leading-[1.15]">{EVENT.dressCode.title}</p>
              {dressText && <p className="m-0 mt-[6px] font-sans text-[14px] leading-[1.5] text-deep-rose">{dressText}</p>}
            </div>
          </div>
          <p className="m-0 mt-[18px] flex items-center gap-[10px] bg-wine px-[14px] py-[13px] font-sans text-[14px] font-medium tracking-[.02em] text-paper">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className="flex-none text-gold-light">
              <path
                d="M1 11c2-2 4-2 6 0s4 2 6 0 3-1.6 4-.6M1 15c2-2 4-2 6 0s4 2 6 0 3-1.6 4-.6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
              <circle cx="12" cy="4.5" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
            </svg>
            {dressHighlight}
          </p>
          <div aria-hidden="true" className="relative -mx-5 h-[34px] overflow-hidden">
            <svg className="the-day-wave absolute top-0 left-0" viewBox="0 0 800 34" width="800" height="34">
              <path d={WAVE} fill="none" stroke="#B8955A" strokeWidth="1.2" />
            </svg>
            <svg className="the-day-wave the-day-wave-slow absolute top-0 left-0" viewBox="0 0 800 34" width="800" height="34">
              <path transform="translate(-20 12)" d={`${WAVE} T820 12`} fill="none" stroke="#E07A9C" strokeWidth="1.2" />
            </svg>
          </div>
        </RevealItem>
      </Reveal>
    </div>
  )
}
