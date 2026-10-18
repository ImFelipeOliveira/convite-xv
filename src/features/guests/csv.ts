import Papa from 'papaparse'
import { EVENT } from '@/features/event/event'
import type { Guest, RsvpStatus } from '@/server/db/schema'
import type { CsvLineError } from './import-report'
import { formatPhone } from './phone'
import { guestFormSchema } from './schema'
import { inviteUrl } from './whatsapp'

export type ImportedGuest = { name: string; phone: string | null; plusOnesLimit: number }

// CSV headers are user-facing data the family edits: they stay in pt-BR.
const NAME_HEADER = 'nome'
const PHONE_HEADER = 'telefone'
const LIMIT_HEADER = 'limite_acompanhantes'

/**
 * Parses the family's guest spreadsheet (`;` or `,` separated, optional BOM).
 * Line numbers are 1-based file lines (header = 1, blank lines counted, quoted line breaks not supported).
 */
export function parseGuestsCsv(text: string): { valid: ImportedGuest[]; errors: CsvLineError[] } {
  const body = text.replace(/^\uFEFF/, '')
  // Guess the separator ignoring blank lines (they skew papaparse's guess), then parse keeping them
  // so the row index still maps to the file line.
  const { delimiter } = Papa.parse<string[]>(body, {
    delimitersToGuess: [';', ','],
    skipEmptyLines: 'greedy',
    preview: 20,
  }).meta
  const { data } = Papa.parse<string[]>(body, { delimiter, skipEmptyLines: false })
  const [headerRow = [], ...rows] = data
  const headers = headerRow.map((h) => h.trim().toLowerCase())
  const nameIdx = headers.indexOf(NAME_HEADER)
  if (nameIdx < 0) return { valid: [], errors: [{ line: 1, reason: 'Cabeçalho "nome" obrigatório' }] }
  const phoneIdx = headers.indexOf(PHONE_HEADER)
  const limitIdx = headers.indexOf(LIMIT_HEADER)

  const valid: ImportedGuest[] = []
  const errors: CsvLineError[] = []
  rows.forEach((row, i) => {
    if (row.every((cell) => cell.trim() === '')) return
    const line = i + 2
    const cell = (idx: number) => (idx >= 0 ? (row[idx] ?? '') : '')
    const parsed = guestFormSchema.safeParse({
      name: cell(nameIdx),
      phone: cell(phoneIdx),
      plusOnesLimit: cell(limitIdx).trim() || '0',
    })
    if (parsed.success) valid.push(parsed.data)
    else errors.push({ line, reason: parsed.error.issues[0].message })
  })
  return { valid, errors }
}

const STATUS_LABEL: Record<RsvpStatus, string> = { pending: 'Pendente', yes: 'Sim', no: 'Não' }

const respondedAtFormat = new Intl.DateTimeFormat('pt-BR', {
  timeZone: EVENT.timeZone,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** Date → 'dd/mm/aaaa HH:mm' in America/Boa_Vista. */
function formatRespondedAt(d: Date): string {
  const p = Object.fromEntries(respondedAtFormat.formatToParts(d).map((x) => [x.type, x.value]))
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`
}

/** Spreadsheet export: `;` separated, BOM so Excel reads UTF-8, formulas neutralized. */
export function buildGuestsCsv(list: Guest[]): string {
  const csv = Papa.unparse(
    {
      fields: [
        NAME_HEADER,
        PHONE_HEADER,
        LIMIT_HEADER,
        'resposta',
        'acompanhantes',
        'recado',
        'respondido_em',
        'link',
      ],
      data: list.map((g) => [
        g.name,
        g.phone ? formatPhone(g.phone) : '',
        g.plusOnesLimit,
        STATUS_LABEL[g.rsvpStatus],
        g.plusOnes,
        g.message ?? '',
        g.respondedAt ? formatRespondedAt(g.respondedAt) : '',
        inviteUrl(g.token),
      ]),
    },
    { delimiter: ';', newline: '\r\n', escapeFormulae: true },
  )
  return `\uFEFF${csv}`
}
