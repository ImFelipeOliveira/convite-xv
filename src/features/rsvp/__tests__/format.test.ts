import { describe, expect, it } from 'vitest'
import { formatDayMonth, formatRespondedAt } from '../format'

describe('formatDayMonth', () => {
  it('turns the stored deadline into dd/mm', () => {
    expect(formatDayMonth('2026-12-13')).toBe('13/12')
  })
})

describe('formatRespondedAt', () => {
  it('shows Boa Vista time (UTC-4), whatever the machine timezone', () => {
    expect(formatRespondedAt('2026-12-14T03:05:00Z')).toBe('Resposta registrada em 13/12 às 23h05')
  })

  it('pads morning hours', () => {
    expect(formatRespondedAt('2026-11-02T12:30:00Z')).toBe('Resposta registrada em 02/11 às 08h30')
  })
})
