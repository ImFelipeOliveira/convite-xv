// Link-preview crawlers fetch the invite page only to build the card: that isn't the guest opening it.
const LINK_PREVIEW_BOTS =
  /whatsapp|facebookexternalhit|facebot|telegrambot|twitterbot|slackbot|discordbot|linkedinbot|googlebot/i

export function isLinkPreviewBot(userAgent: string): boolean {
  return LINK_PREVIEW_BOTS.test(userAgent)
}
