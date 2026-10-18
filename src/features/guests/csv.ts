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

// Never present in a spreadsheet: used to read a `nome`-only file one whole line per name.
const NO_DELIMITER = '\u001F'
const MALFORMED_LINE = 'Linha mal formatada'

type Row = { line: number; cells: string[] }

/**
 * Parses with papaparse, recovering from quote errors: the broken line is reported and parsing
 * resumes on the next physical line (an unclosed quote would otherwise swallow the rest of the file).
 */
function parseRows(body: string, delimiter: string): { rows: Row[]; malformed: number[] } {
  const rows: Row[] = []
  const malformed: number[] = []
  let offset = 0
  let lineBase = 1
  while (offset < body.length) {
    const chunk = body.slice(offset)
    const { data, errors } = Papa.parse<string[]>(chunk, { delimiter, skipEmptyLines: false })
    const badRow = Math.min(...errors.map((e) => e.row ?? Infinity))
    if (badRow === Infinity) {
      data.forEach((cells, i) => rows.push({ line: lineBase + i, cells }))
      break
    }
    data.slice(0, badRow).forEach((cells, i) => rows.push({ line: lineBase + i, cells }))
    malformed.push(lineBase + badRow)
    let end = -1
    for (let n = 0; n <= badRow; n++) {
      end = chunk.indexOf('\n', end + 1)
      if (end < 0) break
    }
    if (end < 0) break
    offset += end + 1
    lineBase += badRow + 1
  }
  return { rows, malformed }
}

/**
 * Parses the family's guest spreadsheet (`;` or `,` separated, optional BOM).
 * Line numbers are 1-based file lines (header = 1, blank lines counted, quoted line breaks not supported).
 * A file whose only column is `nome` is read one whole line per name (so "Silva, João" stays intact).
 */
export function parseGuestsCsv(text: string): { valid: ImportedGuest[]; errors: CsvLineError[] } {
  const body = text.replace(/^\uFEFF/, '')
  const headerLine = body.split(/\r?\n/, 1)[0]
  const firstCell = headerLine.trim().replace(/^"(.*)"$/, '$1').trim().toLowerCase()
  // The separator is guessed from the header line alone: data lines may be broken or blank.
  const delimiter =
    firstCell === NAME_HEADER
      ? NO_DELIMITER
      : Papa.parse<string[]>(headerLine, { delimitersToGuess: [';', ','] }).meta.delimiter
  const { rows: allRows, malformed } = parseRows(body, delimiter)
  if (malformed.includes(1)) return { valid: [], errors: [{ line: 1, reason: MALFORMED_LINE }] }
  const [header, ...rows] = allRows
  const headers = (header?.cells ?? []).map((h) => h.trim().toLowerCase())
  const nameIdx = headers.indexOf(NAME_HEADER)
  if (nameIdx < 0) return { valid: [], errors: [{ line: 1, reason: 'Cabeçalho "nome" obrigatório' }] }
  const phoneIdx = headers.indexOf(PHONE_HEADER)
  const limitIdx = headers.indexOf(LIMIT_HEADER)

  const valid: ImportedGuest[] = []
  const errors: CsvLineError[] = malformed.map((line) => ({ line, reason: MALFORMED_LINE }))
  for (const { line, cells } of rows) {
    if (cells.every((cell) => cell.trim() === '')) continue
    const cell = (idx: number) => (idx >= 0 ? (cells[idx] ?? '') : '')
    const parsed = guestFormSchema.safeParse({
      name: cell(nameIdx),
      phone: cell(phoneIdx),
      plusOnesLimit: cell(limitIdx).trim() || '0',
    })
    if (parsed.success) valid.push(parsed.data)
    else errors.push({ line, reason: parsed.error.issues[0].message })
  }
  errors.sort((a, b) => a.line - b.line)
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
