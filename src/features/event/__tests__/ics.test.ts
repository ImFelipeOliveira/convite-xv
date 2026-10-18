import { describe, expect, it } from 'vitest'
import { generateIcs } from '../ics'

describe('generateIcs', () => {
  const ics = generateIcs({ name: 'Ana', link: 'https://example.com/c/abc' })

  it('contains the event times and summary', () => {
    expect(ics).toContain('UID:xv-isabella-2026@convite')
    expect(ics).toContain('DTSTART:20261227T140000Z')
    expect(ics).toContain('DTEND:20261227T220000Z')
    expect(ics).toContain('SUMMARY:XV anos da Isabella')
  })

  it('escapes commas in the location', () => {
    expect(ics).toContain('LOCATION:Sítio Lua Azul\\, Rodovia BR-401')
  })

  it('includes the invite link and a reminder alarm', () => {
    expect(ics).toContain('https://example.com/c/abc')
    expect(ics).toContain('BEGIN:VALARM')
    expect(ics).toContain('TRIGGER:-P1D')
  })

  it('uses CRLF for every line break', () => {
    expect(ics).not.toMatch(/(?<!\r)\n/)
    expect(ics.endsWith('\r\n')).toBe(true)
  })

  it('escapes semicolons and newlines in TEXT values', () => {
    const out = generateIcs({ name: 'Ana; Bia\nCris', link: 'https://example.com/c/x' })
    expect(out).toContain('Ana\\; Bia\\nCris')
  })

  it('folds long lines to at most 75 octets with a leading space', () => {
    const out = generateIcs({ name: 'Ana '.repeat(60), link: 'https://example.com/c/x' })
    const lines = out.split('\r\n').slice(0, -1)
    expect(lines.some((l) => l.startsWith(' '))).toBe(true)
    for (const l of lines) expect(Buffer.byteLength(l)).toBeLessThanOrEqual(75)
    expect(out.replace(/\r\n /g, '')).toContain('Ana Ana Ana')
  })
})
