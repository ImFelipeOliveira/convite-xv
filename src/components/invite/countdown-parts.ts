export type CountdownParts = { days: number; hours: number; minutes: number; seconds: number; finished: boolean }

const MAX_DAYS = 99 // the odometer has two day digits (prancha 06)

export function countdownParts(targetIso: string, now: number): CountdownParts {
  const left = Math.max(0, Date.parse(targetIso) - now)
  const totalSeconds = Math.floor(left / 1000)
  return {
    days: Math.min(MAX_DAYS, Math.floor(totalSeconds / 86_400)),
    hours: Math.floor((totalSeconds % 86_400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    finished: left === 0,
  }
}
