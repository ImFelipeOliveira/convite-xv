import { describe, expect, it } from 'vitest'
import { countdownParts } from '../countdown-parts'

const TARGET = '2026-12-27T14:00:00Z'

describe('countdownParts', () => {
  it('splits the time left into days, hours, minutes and seconds', () => {
    expect(countdownParts(TARGET, Date.parse('2026-12-26T13:00:00Z'))).toEqual({
      days: 1,
      hours: 1,
      minutes: 0,
      seconds: 0,
      finished: false,
    })
  })

  it('is finished with zeros once the target has passed', () => {
    expect(countdownParts(TARGET, Date.parse('2026-12-27T15:30:00Z'))).toEqual({
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      finished: true,
    })
  })

  it('is finished exactly at the target', () => {
    expect(countdownParts(TARGET, Date.parse(TARGET)).finished).toBe(true)
  })

  it('caps days at 99', () => {
    const now = Date.parse(TARGET) - 200 * 86_400_000
    expect(countdownParts(TARGET, now)).toMatchObject({ days: 99, finished: false })
  })
})
