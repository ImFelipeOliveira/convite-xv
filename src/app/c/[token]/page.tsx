import { notFound } from 'next/navigation'
import { Opening } from '@/components/invite/Opening'
import { Frame } from '@/components/ornaments/Frame'
import { Lily } from '@/components/ornaments/Lily'
import { Monogram } from '@/components/ornaments/Monogram'
import { EVENT } from '@/features/event/event'
import { findGuestByToken, markOpened } from '@/features/guests/repo'

// Rate limit and the 404 status for unknown tokens live in src/proxy.ts (the shell streams
// before this lookup, so notFound() here can't change the status). The gate needs the guest,
// so this segment is blocking by design: no static shell to validate.
export const instant = false

export default async function InvitePage({ params }: PageProps<'/c/[token]'>) {
  const { token } = await params
  const guest = await findGuestByToken(token)
  if (!guest) notFound()
  await markOpened(guest.id)

  return (
    <Opening name={EVENT.celebrant}>
      {/* Placeholder until Tasks 8–9 add Hero, TheDay, RSVP and Closing */}
      <section className="relative flex min-h-dvh flex-col items-center overflow-hidden px-9 pt-[136px] pb-12 text-center font-display text-wine">
        <Frame double />
        <Lily size={230} className="stage-bloom absolute top-[-58px] left-[-62px]" delay={0.3} />
        <Monogram letter="I" className="stage-item" style={{ animationDelay: '.35s' }} />
        <h1 className="mt-[30px] font-script text-[92px] leading-[1.05] font-normal text-rose">
          <span className="stage-ink inline-block px-[14px]" style={{ animationDelay: '.55s' }}>
            {EVENT.celebrant}
          </span>
        </h1>
        <p className="stage-item mt-5 text-[20px] tracking-[.34em] text-gold-text" style={{ animationDelay: '1.4s' }}>
          XV ANOS
        </p>
      </section>
    </Opening>
  )
}
