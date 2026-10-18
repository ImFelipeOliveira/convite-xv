// pt-BR dates shown on the RSVP screen. Always in the event's timezone (Roraima), never the device's.
import { EVENT } from '@/features/event/event'

const respondedAtFormat = new Intl.DateTimeFormat('pt-BR', {
  timeZone: EVENT.timeZone,
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** '2026-12-13' → '13/12' (a calendar date: no timezone involved). */
export function formatDayMonth(date: string): string {
  const [, month, day] = date.split('-')
  return `${day}/${month}`
}

/** ISO instant → 'Resposta registrada em 13/12 às 23h05' in America/Boa_Vista. */
export function formatRespondedAt(iso: string): string {
  const parts = Object.fromEntries(
    respondedAtFormat.formatToParts(new Date(iso)).map((p) => [p.type, p.value]),
  )
  return `Resposta registrada em ${parts.day}/${parts.month} às ${parts.hour}h${parts.minute}`
}
