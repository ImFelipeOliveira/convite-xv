/** 7000 → 'R$ 70,00' (plain space, '.' thousands, ',' decimals). */
export function formatCents(cents: number): string {
  const reais = Math.floor(cents / 100)
  const rest = String(cents % 100).padStart(2, '0')
  const grouped = String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `R$ ${grouped},${rest}`
}

const THOUSANDS = /^(\d{1,3}(?:\.\d{3})+)(?:,(\d{1,2}))?$/
const PLAIN = /^(\d+)(?:,(\d{1,2}))?$/
const DOT_DECIMAL = /^(\d+)\.(\d{1,2})$/
const MAX_REAIS_DIGITS = 9

/** pt-BR amount typed by a guest → cents: '1.250,5' → 125050, '70' → 7000; invalid → null. */
export function parseReais(input: string): number | null {
  const text = input.trim().replace(/^R\$\s*/i, '')
  const m = THOUSANDS.exec(text) ?? PLAIN.exec(text) ?? DOT_DECIMAL.exec(text)
  if (!m) return null
  const reais = m[1].replace(/\./g, '')
  if (reais.length > MAX_REAIS_DIGITS) return null
  const cents = (m[2] ?? '').padEnd(2, '0')
  return Number(reais) * 100 + Number(cents)
}
