import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { Closing } from '@/components/invite/Closing'
import { Hero } from '@/components/invite/Hero'
import { Opening } from '@/components/invite/Opening'
import { Rsvp } from '@/components/invite/Rsvp'
import { TheDay } from '@/components/invite/TheDay'
import { EVENT } from '@/features/event/event'
import { findGuestByToken, markOpened } from '@/features/guests/repo'
import { isDeadlinePassed } from '@/features/rsvp/deadline'
import { toRsvpGuestView } from '@/features/rsvp/view'
import { getSettings } from '@/features/settings/repo'

// Rate limit and the 404 status for unknown tokens live in src/proxy.ts (the shell streams
// before this lookup, so notFound() here can't change the status). The gate needs the guest,
// so this segment is blocking by design: no static shell to validate.
export const instant = false

/** Request time for the countdown's first frame and the RSVP deadline (kept out of render: Date.now is impure). */
async function requestTime(): Promise<number> {
  await connection()
  return Date.now()
}

export default async function InvitePage({ params }: PageProps<'/c/[token]'>) {
  const { token } = await params
  const guest = await findGuestByToken(token)
  if (!guest) notFound()
  await markOpened(guest.id)
  const settings = await getSettings()
  const now = await requestTime()

  return (
    <Opening name={EVENT.celebrant}>
      <main className="mx-auto w-full max-w-[480px] overflow-x-clip">
        <Hero name={EVENT.celebrant} visual="lily" />
        <TheDay token={token} contactInfo={settings.contactInfo} now={now} />
        <Rsvp
          guest={toRsvpGuestView(guest)}
          token={token}
          deadline={settings.rsvpDeadline}
          closed={isDeadlinePassed(settings.rsvpDeadline, new Date(now))}
          contact={settings.contactInfo}
        />
        <Closing message={settings.closingMessage} contactInfo={settings.contactInfo} />
      </main>
    </Opening>
  )
}
