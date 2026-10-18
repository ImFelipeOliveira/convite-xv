import { describe, expect, it } from 'vitest'
import { isDeadlinePassed } from '../deadline'

describe('isDeadlinePassed', () => {
  it('is still open at 23:30 Boa Vista on the deadline day', () => {
    expect(isDeadlinePassed('2026-12-13', new Date('2026-12-14T03:30:00Z'))).toBe(false)
  })

  it('is closed after midnight Boa Vista', () => {
    expect(isDeadlinePassed('2026-12-13', new Date('2026-12-14T04:01:00Z'))).toBe(true)
  })

  it('is open well before the deadline', () => {
    expect(isDeadlinePassed('2026-12-13', new Date('2026-12-01T12:00:00Z'))).toBe(false)
  })
})
