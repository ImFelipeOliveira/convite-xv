import { describe, expect, it } from 'vitest'
import { activePreferredDate, isDeadlinePassed } from '../deadline'

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

describe('activePreferredDate', () => {
  it('shows the preferred date up to and including that day in Boa Vista', () => {
    expect(activePreferredDate('2026-11-21', '2026-12-13', new Date('2026-11-01T12:00:00Z'))).toBe('2026-11-21')
    expect(activePreferredDate('2026-11-21', '2026-12-13', new Date('2026-11-22T03:59:00Z'))).toBe('2026-11-21')
  })

  it('hides it once past, when unset, or after the deadline', () => {
    expect(activePreferredDate('2026-11-21', '2026-12-13', new Date('2026-11-22T04:00:00Z'))).toBeNull()
    expect(activePreferredDate(null, '2026-12-13', new Date('2026-11-01T12:00:00Z'))).toBeNull()
    expect(activePreferredDate('2026-12-20', '2026-12-13', new Date('2026-11-01T12:00:00Z'))).toBeNull()
  })
})
