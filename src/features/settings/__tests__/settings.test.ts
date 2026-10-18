import { describe, expect, it } from 'vitest'
import { getSettings, saveSettings } from '../repo'
import { settingsFormSchema, todayInBoaVista } from '../schema'

const TODAY = '2026-10-17'
const valid = {
  rsvpDeadline: '2026-12-10',
  contactInfo: 'Fale com a Isabella',
  closingMessage: 'Te esperamos!',
  whatsappInviteTemplate: 'Oi! Seu convite: {link}',
}
const parse = (over: Record<string, string>) =>
  settingsFormSchema(TODAY).safeParse({ ...valid, ...over })
const messages = (r: ReturnType<typeof parse>) =>
  r.success ? [] : r.error.issues.map((i) => i.message)

describe('settings form schema', () => {
  it('requires {link} in the WhatsApp template', () => {
    expect(messages(parse({ whatsappInviteTemplate: 'Oi, venha!' }))).toContain(
      'A mensagem precisa conter {link}.',
    )
  })

  it('rejects a deadline after the party', () => {
    expect(messages(parse({ rsvpDeadline: '2026-12-27' }))).toContain('O prazo deve ser antes da festa.')
  })

  it('accepts the day before the party and today, rejects the past and bad dates', () => {
    expect(parse({ rsvpDeadline: '2026-12-26' }).success).toBe(true)
    expect(parse({ rsvpDeadline: TODAY }).success).toBe(true)
    expect(messages(parse({ rsvpDeadline: '2026-10-16' }))).toContain('O prazo não pode estar no passado.')
    expect(messages(parse({ rsvpDeadline: '2026-02-31' }))).toContain('Informe uma data válida.')
    expect(messages(parse({ rsvpDeadline: '' }))).toContain('Informe uma data válida.')
  })

  it('enforces max lengths', () => {
    expect(messages(parse({ contactInfo: 'a'.repeat(201) }))).toContain('Use até 200 caracteres.')
    expect(messages(parse({ closingMessage: 'a'.repeat(601) }))).toContain('Use até 600 caracteres.')
    expect(messages(parse({ whatsappInviteTemplate: '{link}' + 'a'.repeat(600) }))).toContain(
      'Use até 600 caracteres.',
    )
  })

  it('turns blank optional fields into null', () => {
    const r = parse({ contactInfo: '  ', closingMessage: '' })
    expect(r.success && r.data.contactInfo).toBeNull()
    expect(r.success && r.data.closingMessage).toBeNull()
  })

  it('saves a valid form and getSettings reflects it', async () => {
    const r = parse({})
    if (!r.success) throw new Error('expected valid')
    await saveSettings(r.data)
    expect(await getSettings()).toMatchObject(valid)
  })

  it('computes today in America/Boa_Vista', () => {
    expect(todayInBoaVista(new Date('2026-10-18T02:00:00Z'))).toBe('2026-10-17')
    expect(todayInBoaVista(new Date('2026-10-18T04:00:00Z'))).toBe('2026-10-18')
  })
})
