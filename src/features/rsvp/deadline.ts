// Roraima has no daylight saving time, so the -04:00 offset is fixed.
export function isDeadlinePassed(deadline: string, now: Date): boolean {
  const end = new Date(`${deadline}T23:59:59.999-04:00`)
  return now.getTime() > end.getTime()
}

/**
 * The "answer preferably by" date to show on the invite: set, not past yet (end of that day in
 * Boa Vista) and not after the deadline. Otherwise null (the invite shows only the deadline).
 */
export function activePreferredDate(preferred: string | null, deadline: string, now: Date): string | null {
  if (!preferred || preferred > deadline) return null
  return isDeadlinePassed(preferred, now) ? null : preferred
}
