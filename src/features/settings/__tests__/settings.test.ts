import { describe, expect, it } from 'vitest'
import { getSettings, saveSettings } from '../repo'
import { settingsFormSchema, todayInBoaVista } from '../schema'

const TODAY = '2026-10-17'
const valid = {
  rsvpDeadline: '2026-12-10',
  contactInfo: 'Fale com a Isabella',
  closingMessage: 'Te esperamos!',
  whatsappInviteTemplate: 'Oi! Seu convite: {link}',
  reminderD7Text: 'Falta uma semana! {link}',
  reminderD1Text: 'É amanhã! {link}',
  rsvpPreferredDate: '2026-11-21',
  rsvpNudgeText: 'Ainda não respondeu? {link}',
  rsvpFinalText: 'Último dia! {link}',
  giftListText: 'Presentes: {link}',
  giftNudgeText: 'Lembrete de presente: {link}',
  pixThanksMessage: 'Obrigada pelo presente!',
  pixReceiverName: 'Felipe Oliveira Souza',
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

  it('requires {link} in both reminder texts', () => {
    expect(messages(parse({ reminderD7Text: 'Falta uma semana!' }))).toContain('A mensagem precisa conter {link}.')
    expect(messages(parse({ reminderD1Text: 'É amanhã!' }))).toContain('A mensagem precisa conter {link}.')
    const r = parse({ reminderD7Text: '' })
    expect(r.success).toBe(false)
  })

  it('limits reminder texts to 600 characters', () => {
    expect(messages(parse({ reminderD7Text: '{link}' + 'a'.repeat(600) }))).toContain('Use até 600 caracteres.')
    expect(messages(parse({ reminderD1Text: '{link}' + 'a'.repeat(600) }))).toContain('Use até 600 caracteres.')
  })

  it('rejects a deadline after the party', () => {
    expect(messages(parse({ rsvpDeadline: '2026-12-27' }))).toContain('O prazo deve ser antes da festa.')
  })

  it('accepts the day before the party and today, rejects the past and bad dates', () => {
    expect(parse({ rsvpDeadline: '2026-12-26' }).success).toBe(true)
    expect(parse({ rsvpDeadline: TODAY, rsvpPreferredDate: '' }).success).toBe(true)
    expect(messages(parse({ rsvpDeadline: '2026-10-16' }))).toContain('O prazo não pode estar no passado.')
    expect(messages(parse({ rsvpDeadline: '2026-02-31' }))).toContain('Informe uma data válida.')
    expect(messages(parse({ rsvpDeadline: '' }))).toContain('Informe uma data válida.')
  })

  it('allows an unchanged deadline that is already in the past, but not a new past one', () => {
    const past = { ...valid, rsvpDeadline: '2026-10-01', contactInfo: 'Novo contato', rsvpPreferredDate: '' }
    expect(settingsFormSchema(TODAY, '2026-10-01').safeParse(past).success).toBe(true)
    expect(settingsFormSchema(TODAY, '2026-10-02').safeParse(past).success).toBe(false)
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

  it('rejects a preferred date after the deadline, accepts the deadline itself', () => {
    expect(messages(parse({ rsvpPreferredDate: '2026-12-11' }))).toContain(
      'A data de preferência deve ser até o prazo para confirmar.',
    )
    expect(parse({ rsvpPreferredDate: '2026-12-10' }).success).toBe(true)
  })

  it('treats a blank preferred date as none and rejects bad or past ones', () => {
    const r = parse({ rsvpPreferredDate: '' })
    expect(r.success && r.data.rsvpPreferredDate).toBeNull()
    expect(messages(parse({ rsvpPreferredDate: '2026-02-31' }))).toContain('Informe uma data válida.')
    expect(messages(parse({ rsvpPreferredDate: '2026-10-16' }))).toContain('A data não pode estar no passado.')
  })

  it('allows an unchanged preferred date that is already in the past', () => {
    const past = { ...valid, rsvpPreferredDate: '2026-10-01' }
    expect(settingsFormSchema(TODAY, undefined, '2026-10-01').safeParse(past).success).toBe(true)
    expect(settingsFormSchema(TODAY, undefined, '2026-10-02').safeParse(past).success).toBe(false)
  })

  it('requires {link} in the rsvp nudge texts', () => {
    expect(messages(parse({ rsvpNudgeText: 'Responda!' }))).toContain('A mensagem precisa conter {link}.')
    expect(messages(parse({ rsvpFinalText: 'Último dia!' }))).toContain('A mensagem precisa conter {link}.')
  })

  it('requires {link} in both gift texts', () => {
    expect(messages(parse({ giftListText: 'Veja a lista!' }))).toContain('A mensagem precisa conter {link}.')
    expect(messages(parse({ giftNudgeText: 'Lembra do presente?' }))).toContain('A mensagem precisa conter {link}.')
    expect(messages(parse({ giftNudgeText: '{link}' + 'a'.repeat(600) }))).toContain('Use até 600 caracteres.')
  })

  it('defaults the gift texts', async () => {
    const s = await getSettings()
    expect(s.giftListText).toBe(
      'Oba, {nome}! Sua presença nos 15 anos da Isabella está confirmada. Se quiser presentear, a lista de presentes (com sugestões de onde comprar) e a opção de Pix estão no seu convite: {link}',
    )
    expect(s.giftNudgeText).toBe(
      'Oi, {nome}! Que bom que você vem aos 15 anos da Isabella. Se quiser presentear, a lista de presentes (com sugestões de onde comprar) e a opção de Pix estão no seu convite: {link} — Se você já escolheu um presente ou fez o Pix, pode ignorar esta mensagem.',
    )
  })

  it('defaults the rsvp nudge settings', async () => {
    const s = await getSettings()
    expect(s.rsvpPreferredDate).toBe('2026-11-21')
    expect(s.rsvpNudgeText).toBe(
      'Oi, {nome}! Ainda não recebemos sua confirmação para os 15 anos da Isabella. Se puder, responda até {preferencia} pelo seu convite: {link}',
    )
    expect(s.rsvpFinalText).toBe(
      'Oi, {nome}! O prazo para confirmar presença nos 15 anos da Isabella termina em {prazo}. Responda pelo seu convite: {link}',
    )
  })

  it('pix settings: thanks message up to 400 (blank → null), receiver name required up to 80', () => {
    expect(messages(parse({ pixThanksMessage: 'a'.repeat(401) }))).toContain('Use até 400 caracteres.')
    expect(parse({ pixThanksMessage: 'a'.repeat(400) }).success).toBe(true)
    const blank = parse({ pixThanksMessage: '  ' })
    expect(blank.success && blank.data.pixThanksMessage).toBeNull()
    expect(messages(parse({ pixReceiverName: ' ' }))).toContain('Informe o nome de quem recebe.')
    expect(messages(parse({ pixReceiverName: 'a'.repeat(81) }))).toContain('Use até 80 caracteres.')
    const trimmed = parse({ pixReceiverName: '  Maria Souza ' })
    expect(trimmed.success && trimmed.data.pixReceiverName).toBe('Maria Souza')
  })

  it('defaults the Pix receiver name (shown under the QR) and leaves the thanks message unset', async () => {
    const s = await getSettings()
    expect(s.pixReceiverName).toBe('Felipe Oliveira Souza')
    expect(s.pixThanksMessage).toBeNull()
  })

  it('computes today in America/Boa_Vista', () => {
    expect(todayInBoaVista(new Date('2026-10-18T02:00:00Z'))).toBe('2026-10-17')
    expect(todayInBoaVista(new Date('2026-10-18T04:00:00Z'))).toBe('2026-10-18')
  })
})
