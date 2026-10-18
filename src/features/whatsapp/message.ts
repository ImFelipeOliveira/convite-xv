import { formatDayMonth } from '@/features/rsvp/format'

export type TemplateValues = {
  name: string
  link: string
  /** rsvpDeadline 'YYYY-MM-DD' → `{prazo}` as dd/mm */
  deadline?: string
  /** rsvpPreferredDate 'YYYY-MM-DD' → `{preferencia}` as dd/mm (falls back to the deadline) */
  preferredDate?: string | null
}

/**
 * Fills `{nome}` (first name), `{link}` and, when given, `{prazo}` / `{preferencia}` in one pass,
 * so values are never re-substituted. A date placeholder without a value is left as is.
 */
export function renderTemplate(template: string, v: TemplateValues): string {
  const firstName = v.name.trim().split(/\s+/)[0] ?? ''
  return template.replace(/\{(nome|link|prazo|preferencia)\}/g, (match, key: string) => {
    if (key === 'nome') return firstName
    if (key === 'link') return v.link
    const date = key === 'prazo' ? v.deadline : (v.preferredDate ?? v.deadline)
    return date ? formatDayMonth(date) : match
  })
}

const GREETINGS = ['Olá,', 'Oi,', 'Olá!']

/** Varies a leading "Olá," by seed so automatic sends are not byte-identical. */
export function varyGreeting(text: string, seed: number): string {
  if (!text.startsWith('Olá,')) return text
  const i = ((seed % GREETINGS.length) + GREETINGS.length) % GREETINGS.length
  return GREETINGS[i] + text.slice('Olá,'.length)
}
