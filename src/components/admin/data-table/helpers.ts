// Pure helpers for the admin DataTable (no React, unit-tested).

const BOA_VISTA = 'America/Boa_Vista'

/** Lowercase, trimmed, without diacritics: "  Ána " → "ana". */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

/** Accent- and case-insensitive "contains"; an empty query matches everything. */
export function matchesSearch(value: unknown, query: string): boolean {
  const q = normalizeText(query)
  if (!q) return true
  if (typeof value !== 'string' && typeof value !== 'number') return false
  return normalizeText(String(value)).includes(q)
}

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true })

/** pt-BR ordering that ignores accents and case. */
export function compareText(a: string, b: string): number {
  return collator.compare(a, b)
}

/** "Mostrando 1–20 de 25" for the current page. */
export function formatRange(pageIndex: number, pageSize: number, total: number): string {
  if (total === 0) return 'Nenhum resultado'
  const from = pageIndex * pageSize + 1
  const to = Math.min(total, (pageIndex + 1) * pageSize)
  return `Mostrando ${from}–${to} de ${total}`
}

const dateTimeFormat = new Intl.DateTimeFormat('pt-BR', {
  timeZone: BOA_VISTA,
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** "20/12 às 10:00" in Boa Vista time, or "—". */
export function formatBoaVistaDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const parts = Object.fromEntries(dateTimeFormat.formatToParts(new Date(iso)).map((p) => [p.type, p.value]))
  return `${parts.day}/${parts.month} às ${parts.hour}:${parts.minute}`
}
