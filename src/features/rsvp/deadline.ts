// Roraima has no daylight saving time, so the -04:00 offset is fixed.
export function isDeadlinePassed(deadline: string, now: Date): boolean {
  const end = new Date(`${deadline}T23:59:59.999-04:00`)
  return now.getTime() > end.getTime()
}
