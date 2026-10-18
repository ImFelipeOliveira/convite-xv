import { LilyOutline } from '@/components/ornaments/LilyOutline'
import { EVENT } from '@/features/event/event'
import { isFeatureEnabled } from '@/features/event/flags'
import { ClosingBand } from './ClosingBand'
import { Reveal, RevealItem } from './Reveal'
import './closing.css'

// Closing (prancha 10): marquee, the lily drawn in gold, "Obrigada" in ink, the celebrant's message
// and the chapter shortcuts. Gifts (V) and Pix (VI) only appear when their feature flag is on.
type Shortcut = { label: string; numeral: string; href: string }

function shortcuts(): Shortcut[] {
  return [
    { label: 'Presença', numeral: 'IV', href: '#rsvp' },
    { label: 'Local', numeral: 'III', href: '#venue' },
    ...(isFeatureEnabled('gifts') ? [{ label: 'Presentes', numeral: 'V', href: '#gifts' }] : []),
    ...(isFeatureEnabled('pix') ? [{ label: 'Pix', numeral: 'VI', href: '#pix' }] : []),
  ]
}

export function Closing({ message, contactInfo }: { message: string | null; contactInfo: string | null }) {
  return (
    <Reveal
      as="section"
      aria-labelledby="closing-title"
      className="relative flex min-h-dvh flex-col overflow-hidden bg-burgundy pt-10 pb-[70px] font-display text-paper"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-[-30px] bottom-[-62px] left-[-30px] text-center text-[300px] leading-[.8] tracking-[-.05em] text-[#3A1824] italic"
      >

      </div>

      <ClosingBand name={EVENT.celebrant} dateLabel="27.12.2026" />

      <div className="relative mt-[63px] flex flex-col items-center px-8 text-center">
        <LilyOutline size={132} />
        <h2 id="closing-title" className="mt-1 font-script text-[92px] leading-none font-normal text-lily">
          <RevealItem as="span" kind="ink" delay={0.6} className="inline-block px-3">
            Obrigada
          </RevealItem>
        </h2>
        <RevealItem delay={1.2}>
          <p className="mt-[6px] text-[24px] leading-[1.3] text-paper">
            por fazer parte
            <br />
            deste capítulo.
          </p>
        </RevealItem>
        {message && (
          <RevealItem delay={1.35}>
            <p className="mt-[18px] max-w-[290px] text-[16px] leading-[1.55] whitespace-pre-line text-[rgba(255,248,246,.78)] italic">
              {message}
            </p>
          </RevealItem>
        )}
        <RevealItem delay={1.5} className="mt-[14px] font-script text-[36px] text-gold-light">
          Com carinho, {EVENT.celebrant}
        </RevealItem>
      </div>

      <RevealItem delay={1.6} className="relative mx-7 mt-auto pt-12">
        <nav
          aria-label="Atalhos do convite"
          className="grid grid-cols-2 border-t border-[rgba(227,200,145,.35)]"
        >
          {shortcuts().map((s, i) => (
            <a
              key={s.href}
              href={s.href}
              className={`closing-link flex h-12 items-center justify-between border-b border-[rgba(227,200,145,.35)] font-sans text-[14px] font-medium text-gold-light no-underline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-gold-light ${
                i % 2 === 0 ? 'border-r pr-[14px]' : 'pl-[14px]'
              }`}
            >
              {s.label}
              <span aria-hidden="true">{s.numeral}</span>
            </a>
          ))}
        </nav>
        {contactInfo && (
          <p className="m-0 mt-[30px] text-center font-sans text-[12px] text-[rgba(255,248,246,.72)]">
            Dúvidas: {contactInfo}
          </p>
        )}
      </RevealItem>
    </Reveal>
  )
}
