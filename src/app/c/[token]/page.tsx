import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { Closing } from '@/components/invite/Closing'
import { GiftChoiceProvider } from '@/components/invite/GiftChoice'
import { Gifts } from '@/components/invite/Gifts'
import { Hero } from '@/components/invite/Hero'
import { InviteMusic } from '@/components/invite/InviteMusic'
import { MarkOpened } from '@/components/invite/MarkOpened'
import { Opening } from '@/components/invite/Opening'
import { Pix, PixUnavailable } from '@/components/invite/Pix'
import { Rsvp } from '@/components/invite/Rsvp'
import { TheDay } from '@/components/invite/TheDay'
import { EVENT } from '@/features/event/event'
import { isFeatureEnabled } from '@/features/event/flags'
import { listGiftsForInvite } from '@/features/gifts/repo'
import { chosenGiftNames, toGiftViews } from '@/features/gifts/view'
import { findGuestByToken } from '@/features/guests/repo'
import { isMusicKey, mediaUrl } from '@/features/media/keys'
import { readAsaasConfig, requirePayerCpf } from '@/features/pix/config'
import { getGuestPixState } from '@/features/pix/service'
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
  // the one rule for showing the gift list (the section, its Closing shortcut and GiftChoiceProvider)
  const hasGifts = gifts.length > 0
  // Pix: the section needs the flag AND an Asaas config (flag on without config → "indisponível")
  const pixEnabled = isFeatureEnabled('pix')
  const pixConfigured = pixEnabled && readAsaasConfig() !== null
  const pix = pixConfigured ? await getGuestPixState(guest.id, new Date(now)) : { current: null, paidCents: null }
  // RSVP "confirmed" screen: thanks for a reserved gift (chosenNames) or a paid Pix (givenElsewhere)
  const givenElsewhere = pix.paidCents !== null ? { pixPaidCents: pix.paidCents } : null

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
      {hasGifts && (
        <Gifts
          id="gifts"
          token={token}
          guestFirstName={guest.name.trim().split(/\s+/)[0]}
          initialGifts={gifts}
          pixEnabled={pixEnabled}
        />
      )}
      {pixConfigured ? (
        <Pix
          id="pix"
          token={token}
          guestFirstName={guest.name.trim().split(/\s+/)[0]}
          guestName={guest.name}
          requireCpf={requirePayerCpf()}
          thanksMessage={settings.pixThanksMessage}
          receiverName={settings.pixReceiverName}
          initialPayment={pix.current}
        />
      ) : (
        pixEnabled && <PixUnavailable id="pix" />
      )}
      <Closing message={settings.closingMessage} contactInfo={settings.contactInfo} hasGifts={hasGifts} />
    </main>
  )

  const invite = (
    <Opening name={EVENT.celebrant}>
      {hasGifts ? (
        <GiftChoiceProvider chosenNames={chosenGiftNames(gifts)} givenElsewhere={givenElsewhere}>
          {body}
        </GiftChoiceProvider>
      ) : (
        body
      )}
    </Opening>
  )
  // background music only when the admin uploaded one; without it nothing music-related renders
  const musicKey = settings.musicKey && isMusicKey(settings.musicKey) ? settings.musicKey : null

  return (
    <>
      <MarkOpened token={token} />
      {musicKey ? (
        <InviteMusic src={mediaUrl(musicKey)} startAt={settings.musicStartSeconds}>
          {invite}
        </InviteMusic>
      ) : (
        invite
      )}
    </>
  )
}
