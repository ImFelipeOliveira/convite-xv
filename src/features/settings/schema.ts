import { z } from 'zod'
import { EVENT } from '@/features/event/event'

/** Last day the deadline may be set to: the day before the party (a calendar date, no timezone). */
export const MAX_DEADLINE = '2026-12-26'

const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: EVENT.timeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** 'YYYY-MM-DD' of `now` in America/Boa_Vista (never the server's or the device's timezone). */
export function todayInBoaVista(now: Date = new Date()): string {
  return dayFormat.format(now)
}

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use até ${max} caracteres.`)
    .transform((v) => (v === '' ? null : v))

/** WhatsApp message text edited by the family: up to 600 characters, must carry the invite link. */
const messageTemplate = z
  .string()
  .trim()
  .max(600, 'Use até 600 caracteres.')
  .refine((v) => v.includes('{link}'), 'A mensagem precisa conter {link}.')

/**
 * Admin settings form. `today` is 'YYYY-MM-DD' in America/Boa_Vista (see todayInBoaVista).
 * `storedDeadline` / `storedPreferredDate` are the saved dates: keeping one unchanged is always
 * allowed, even once it has passed.
 */
export function settingsFormSchema(today: string, storedDeadline?: string, storedPreferredDate?: string | null) {
  return z
    .object({
      rsvpDeadline: z
        .string()
        .trim()
        .refine(isRealDate, 'Informe uma data válida.')
        .refine((v) => !isRealDate(v) || v <= MAX_DEADLINE, 'O prazo deve ser antes da festa.')
        .refine((v) => !isRealDate(v) || v > MAX_DEADLINE || v >= today || v === storedDeadline, 'O prazo não pode estar no passado.'),
      contactInfo: optionalText(200),
      closingMessage: optionalText(600),
      whatsappInviteTemplate: messageTemplate,
      reminderD7Text: messageTemplate,
      reminderD1Text: messageTemplate,
      rsvpPreferredDate: z
        .string()
        .trim()
        .refine((v) => v === '' || isRealDate(v), 'Informe uma data válida.')
        .refine((v) => !isRealDate(v) || v >= today || v === storedPreferredDate, 'A data não pode estar no passado.')
        .transform((v) => (v === '' ? null : v)),
      rsvpNudgeText: messageTemplate,
      rsvpFinalText: messageTemplate,
    })
    .superRefine((d, ctx) => {
      if (d.rsvpPreferredDate && isRealDate(d.rsvpDeadline) && d.rsvpPreferredDate > d.rsvpDeadline) {
        ctx.addIssue({
          code: 'custom',
          path: ['rsvpPreferredDate'],
          message: 'A data de preferência deve ser até o prazo para confirmar.',
        })
      }
    })
}

export type SettingsFormData = z.infer<ReturnType<typeof settingsFormSchema>>
