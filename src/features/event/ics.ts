import { EVENT } from './event'

const escapeText = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

const formatUtc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

// RFC 5545 line folding: max 75 octets per line, continuation lines start with a space.
function fold(line: string): string {
  const parts: string[] = []
  let current = ''
  let bytes = 0
  for (const ch of line) {
    const size = Buffer.byteLength(ch)
    const limit = parts.length === 0 ? 75 : 74
    if (bytes + size > limit) {
      parts.push(current)
      current = ''
      bytes = 0
    }
    current += ch
    bytes += size
  }
  parts.push(current)
  return parts.join('\r\n ')
}

export function generateIcs(invite: { name: string; link: string }): string {
  const start = new Date(EVENT.startsAt)
  const end = new Date(start.getTime() + EVENT.durationHours * 3_600_000)
  const { venue } = EVENT
  const location = [venue.name, venue.address, venue.city].map(escapeText).join('\\, ')
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//convite-xv//isabella//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    'UID:xv-isabella-2026@convite',
    `DTSTAMP:${formatUtc(start)}`,
    `DTSTART:${formatUtc(start)}`,
    `DTEND:${formatUtc(end)}`,
    `SUMMARY:XV anos da ${EVENT.celebrant}`,
    `LOCATION:${location}`,
    `DESCRIPTION:${escapeText(`${invite.name}, seu convite: ${invite.link}`)}`,
    `URL:${invite.link}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(`XV anos da ${EVENT.celebrant} é amanhã!`)}`,
    'TRIGGER:-P1D',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map(fold).join('\r\n') + '\r\n'
}
