import { describe, expect, it } from 'vitest'
import { rsvpErrorMessage } from '../messages'

describe('rsvpErrorMessage over_limit', () => {
  it('uses the singular for a limit of 1', () => {
    expect(rsvpErrorMessage('over_limit', 1)).toBe('Seu convite inclui até 1 acompanhante.')
  })
  it('uses the plural otherwise', () => {
    expect(rsvpErrorMessage('over_limit', 2)).toBe('Seu convite inclui até 2 acompanhantes.')
  })
})
