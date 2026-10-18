const saoPauloDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/**
 * Charge due date: TOMORROW on the Asaas calendar (America/Sao_Paulo), so a charge made late at night
 * in Boa Vista (already the next day in São Paulo) never carries a past date and its QR stays usable.
 */
export function pixDueDate(now: Date): string {
  const today = saoPauloDay.format(now) // YYYY-MM-DD
  const d = new Date(`${today}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}
