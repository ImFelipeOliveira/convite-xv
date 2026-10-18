import { getAppUrl } from '@/lib/app-url'
import { renderTemplate } from '@/features/whatsapp/message'

/** Public invite link for a guest token. */
export function inviteUrl(token: string): string {
  return new URL(`/c/${token}`, getAppUrl()).href
}

/**
 * WhatsApp click-to-chat link with the invite template filled in
 * (`{nome}` → first name, `{link}` → invite URL). Without a phone, WhatsApp asks for the contact.
 */
export function whatsappUrl(
  g: { name: string; phone: string | null; token: string },
  template: string,
): string {
  const text = renderTemplate(template, { name: g.name, link: inviteUrl(g.token) })
  const digits = g.phone ? g.phone.replace(/\D/g, '') : ''
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}
