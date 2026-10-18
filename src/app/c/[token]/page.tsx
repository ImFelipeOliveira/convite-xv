import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { Closing } from '@/components/invite/Closing'
import { GiftChoiceProvider } from '@/components/invite/GiftChoice'
import { Gifts } from '@/components/invite/Gifts'
import { Hero } from '@/components/invite/Hero'
import { MarkOpened } from '@/components/invite/MarkOpened'
import { Opening } from '@/components/invite/Opening'
import { Rsvp } from '@/components/invite/Rsvp'
import { TheDay } from '@/components/invite/TheDay'
import { EVENT } from '@/features/event/event'
import { isFeatureEnabled } from '@/features/event/flags'
import { guestHasGift, listGiftsForInvite } from '@/features/gifts/repo'
import { chosenGiftNames, toGiftViews } from '@/features/gifts/view'
import { findGuestByToken } from '@/features/guests/repo'
import { activePreferredDate, isDeadlinePassed } from '@/features/rsvp/deadline'
import { toRsvpGuestView } from '@/features/rsvp/view'
import { getSettings } from '@/features/settings/repo'
import { getAppUrl } from '@/lib/app-url'

// Rate limit and the 404 status for unknown tokens live in src/proxy.ts (the shell streams
// before this lookup, so notFound() here can't change the status). The gate needs the guest,
// so this segment is blocking by design: no static shell to validate.
export const instant = false

export const metadata: Metadata = {
  metadataBase: getAppUrl(),
  title: 'Isabella · 15 anos',
  description: 'Você recebeu um convite. Toque para abrir a carta.',
  openGraph: { type: 'website' },
}

/** Request time for the countdown's first frame and the RSVP deadline (kept out of render: Date.now is impure). */
async function requestTime(): Promise<number> {
  await connection()
  return Date.now()
}

export default async function InvitePage({ params }: PageProps<'/c/[token]'>) {
  const { token } = await params
  const guest = await findGuestByToken(token)
  if (!guest) notFound()
  // the open is recorded by <MarkOpened> in the browser: rendering here may be a link-preview fetch
  const settings = await getSettings()
  const now = await requestTime()
  // only free | mine | taken reaches the browser; an empty catalog hides the section
  const gifts = isFeatureEnabled('gifts') ? toGiftViews(await listGiftsForInvite(), guest.id) : []
  // RSVP "confirmed" screen: shortcut to the list or thanks (Tasks 6/7 OR a paid Pix into hasGiven)
  const hasGiven = gifts.length > 0 && (await guestHasGift(guest.id))

  const body = (
    <main className="mx-auto w-full max-w-[480px] overflow-x-clip">
      <Hero name={EVENT.celebrant} visual="lily" />
      <TheDay token={token} contactInfo={settings.contactInfo} now={now} />
      <Rsvp
        guest={toRsvpGuestView(guest)}
        token={token}
        deadline={settings.rsvpDeadline}
        preferredDate={activePreferredDate(settings.rsvpPreferredDate, settings.rsvpDeadline, new Date(now))}
        closed={isDeadlinePassed(settings.rsvpDeadline, new Date(now))}
        contact={settings.contactInfo}
      />
      {gifts.length > 0 && (
        <Gifts
          id="gifts"
          token={token}
          guestFirstName={guest.name.trim().split(/\s+/)[0]}
          initialGifts={gifts}
          pixEnabled={isFeatureEnabled('pix')}
        />
      )}
      {/* Task 6: the Pix section (#pix) goes here, between Gifts and Closing */}
      <Closing message={settings.closingMessage} contactInfo={settings.contactInfo} />
    </main>
  )

  return (
    <>
      <MarkOpened token={token} />
      <Opening name={EVENT.celebrant}>
        {gifts.length > 0 ? (
          <GiftChoiceProvider hasGiven={hasGiven} chosenNames={chosenGiftNames(gifts)}>
            {body}
          </GiftChoiceProvider>
        ) : (
          body
        )}
      </Opening>
    </>
  )
}
