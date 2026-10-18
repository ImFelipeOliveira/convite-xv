import { DrawnFrame } from '@/components/ornaments/DrawnFrame'
import { Lily } from '@/components/ornaments/Lily'
import { Monogram } from '@/components/ornaments/Monogram'
import './hero.css'

// Hero (prancha 05) with the 0–3 s entrance from prancha 03: frame thread 0–0.9 s, corner lily
// 0.2–1.6 s, monogram 0.5 s, name ink 0.8–2 s, "15 ANOS" tracking 1.5 s, phrase 1.7 s, date and
// CTA 2.1–2.25 s, ambient petals from 2.4 s. The Opening stage starts it (stage-* classes), and
// everything is clickable from the first frame.
const delay = (seconds: number) => ({ animationDelay: `${seconds}s` })

const PETALS = [
  { left: '12%', w: 12, h: 17, round: false, color: '#EE9DB6', delay: 2.4, duration: 9 },
  { left: '70%', w: 9, h: 13, round: false, color: '#F3AFC4', delay: 4.6, duration: 11 },
  { left: '44%', w: 14, h: 20, round: false, color: '#E07A9C', delay: 7, duration: 13 },
  { left: '86%', w: 7, h: 7, round: true, color: '#E3C891', delay: 3.4, duration: 12 },
]

function Diamond() {
  return <span aria-hidden="true" className="h-1 w-1 rotate-45 bg-gold" />
}

export function Hero({ name, visual = 'lily' }: { name: string; visual?: 'lily' | 'photo' }) {
  return (
    <section
      aria-labelledby="hero-title"
      className="relative flex min-h-dvh flex-col items-center overflow-hidden bg-blush px-8 pb-[120px] font-display text-wine"
    >
      <div
        data-testid="giant-numeral"
        aria-hidden="true"
        className="stage-fade pointer-events-none absolute top-16 right-[-58px] text-[330px] leading-[.8] tracking-[-.05em] text-petal italic"
        style={{ ...delay(0.1), animationDuration: '1.4s' }}
      >
        15
      </div>

      <DrawnFrame />

      {PETALS.map((p) => (
        <span
          key={p.left}
          aria-hidden="true"
          className="hero-drift pointer-events-none absolute top-0"
          style={{
            left: p.left,
            width: p.w,
            height: p.h,
            borderRadius: p.round ? '50%' : '80% 0 80% 0',
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        />
      ))}

      <header className="absolute top-[30px] right-8 left-8 flex items-center justify-between">
        <Monogram letter="I" size={40} className="stage-fade" style={delay(0.5)} />
        <span
          className="stage-fade font-sans text-[11px] font-medium tracking-[.24em] text-gold-text"
          style={delay(0.6)}
        >
          CAPÍTULO I · O CONVITE
        </span>
      </header>

      <div className="relative mt-[92px] h-[300px] w-[230px] shrink-0">
        <div
          aria-hidden="true"
          className="stage-fade absolute top-[-7px] right-[-7px] bottom-0 left-[-7px] rounded-t-full border border-[rgba(184,149,90,.45)]"
          style={delay(0.3)}
        />
        <div
          className="stage-fade absolute inset-0 overflow-hidden rounded-t-full border border-gold bg-paper"
          style={delay(0.2)}
        >
          {visual === 'photo' ? (
            <div className="absolute inset-0 flex items-center justify-center bg-petal p-[30px] text-center font-sans text-[11px] leading-[1.6] tracking-[.16em] text-wine">
              [FOTO DA ANIVERSARIANTE]
              <br />
              retrato 4:5, luz quente
            </div>
          ) : (
            <Lily size={260} delay={0.2} className="stage-bloom absolute top-[28px] left-[-15px]" />
          )}
        </div>
      </div>

      <div className="relative -mt-[42px] flex flex-col items-center text-center">
        <h1 id="hero-title" className="m-0 font-script text-[96px] leading-[1.05] font-normal text-rose">
          <span className="stage-ink inline-block px-[14px]" style={{ ...delay(0.8), animationDuration: '1.1s' }}>
            {name}
          </span>
        </h1>
        <p className="stage-track mt-2 text-[20px] tracking-[.36em] text-gold-text" style={delay(1.5)}>
          15 ANOS
        </p>
        <p
          className="stage-item mt-[18px] max-w-[300px] text-[17px] leading-[1.5] text-deep-rose italic"
          style={delay(1.7)}
        >
          Um dia para encerrar um ciclo e começar uma nova história. Venha celebrar comigo os meus 15 anos!
        </p>
        <p
          className="stage-item mt-[18px] flex items-center gap-[10px] font-sans text-[12px] font-medium tracking-[.2em] text-wine"
          style={delay(2.1)}
        >
          DOMINGO
          <Diamond />
          27 DEZ 2026
          <Diamond />
          10H
        </p>
        <div className="stage-item mt-[22px] flex items-center gap-[18px]" style={delay(2.25)}>
          <a
            href="#rsvp"
            className="hero-cta relative flex h-[52px] items-center gap-[10px] overflow-hidden rounded-full bg-seal px-6 font-sans text-[15px] font-medium tracking-[.04em] text-paper no-underline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-wine"
          >
            <span aria-hidden="true" className="hero-cta-ink absolute inset-0 bg-[#7E2148]" />
            <span className="relative">Confirmar presença</span>
            <svg className="hero-cta-arrow relative" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M2 8h11M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          </a>
          <a
            href="#the-day"
            className="border-b border-[rgba(184,149,90,.8)] pt-3 pb-[3px] font-sans text-[15px] font-medium text-deep-rose no-underline hover:text-wine focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-wine"
          >
            O dia
          </a>
        </div>
      </div>

      <div
        className="stage-fade absolute right-0 bottom-[30px] left-0 flex flex-col items-center gap-2"
        style={delay(2.8)}
      >
        <span className="font-sans text-[10px] font-medium tracking-[.3em] text-gold-text">ROLE</span>
        <span aria-hidden="true" className="relative h-[34px] w-px overflow-hidden bg-[rgba(184,149,90,.25)]">
          <span className="hero-cue absolute inset-0 bg-gold" />
        </span>
      </div>
    </section>
  )
}
