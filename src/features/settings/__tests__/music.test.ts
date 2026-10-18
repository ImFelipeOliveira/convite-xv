import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getStorage } from '@/features/media/storage'
import { saveSettingsAction } from '../actions'
import { getSettings, saveSettings } from '../repo'
import { MUSIC_KEY_ERROR, settingsFormSchema } from '../schema'

vi.mock('@/features/admin-auth/guard', () => ({
  requireAdmin: async () => ({ adminId: '00000000-0000-4000-8000-0000000000aa' }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

const OLD = 'music/0b0e6b3c-3f43-4a52-9a43-2f6a6b4c1d2e.mp3'
const NEW = 'music/1c1f7c4d-4054-4b63-8b54-3a7b7c5d2e3f.m4a'

const base = {
  rsvpDeadline: '2026-12-10',
  contactInfo: '',
  closingMessage: '',
  whatsappInviteTemplate: 'Oi! {link}',
  reminderD7Text: 'Semana! {link}',
  reminderD1Text: 'Amanhã! {link}',
  rsvpPreferredDate: '',
  rsvpNudgeText: 'Responda {link}',
  rsvpFinalText: 'Último dia {link}',
  giftListText: 'Presentes {link}',
  giftNudgeText: 'Presente? {link}',
  pixThanksMessage: '',
  pixReceiverName: 'Felipe Oliveira Souza',
}
const parse = (over: Record<string, string | undefined>) => settingsFormSchema('2026-10-17').safeParse({ ...base, ...over })
const messages = (r: ReturnType<typeof parse>) => (r.success ? [] : r.error.issues.map((i) => i.message))

function form(values: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(values)) fd.set(k, v)
  return fd
}

describe('settings schema: music', () => {
  it('accepts our own key shape or none (blank → null)', () => {
    const r = parse({ musicKey: OLD })
    expect(r.success && r.data.musicKey).toBe(OLD)
    const none = parse({ musicKey: '' })
    expect(none.success && none.data.musicKey).toBeNull()
    const missing = parse({})
    expect(missing.success && missing.data.musicKey).toBeNull()
  })

  it('rejects any other key (traversal, other folders, URLs) like the gift photo key', () => {
    for (const bad of ['../../.env.local', 'gifts/0b0e6b3c-3f43-4a52-9a43-2f6a6b4c1d2e.webp', 'https://evil.example/a.mp3', 'music/a.mp3']) {
      expect(messages(parse({ musicKey: bad })), bad).toContain(MUSIC_KEY_ERROR)
    }
  })

  it('start offset: an integer from 0 to 600, blank → 0', () => {
    for (const [input, expected] of [['', 0], ['0', 0], ['45', 45], ['600', 600], [' 30 ', 30]] as const) {
      const r = parse({ musicStartSeconds: input })
      expect(r.success && r.data.musicStartSeconds, input).toBe(expected)
    }
    expect(messages(parse({ musicStartSeconds: '601' }))).toContain('Use de 0 a 600 segundos.')
    for (const bad of ['-1', '1.5', 'abc', '1e3']) {
      expect(messages(parse({ musicStartSeconds: bad })), bad).toContain('Use um número inteiro de segundos.')
    }
  })
})

describe('saveSettingsAction: music', () => {
  let root: string
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'settings-music-'))
    vi.stubEnv('S3_BUCKET', '')
    vi.stubEnv('MEDIA_DIR', root)
    for (const key of [OLD, NEW]) await getStorage().put(key, Buffer.from(key), 'audio/mpeg')
  })
  afterEach(async () => {
    vi.unstubAllEnvs()
    await rm(root, { recursive: true, force: true })
  })

  it('saves the key and offset; replacing deletes the previous file, removing deletes it too', async () => {
    expect(await saveSettingsAction(null, form({ ...base, musicKey: OLD, musicStartSeconds: '30' }))).toMatchObject({ ok: true })
    expect(await getSettings()).toMatchObject({ musicKey: OLD, musicStartSeconds: 30 })

    expect(await saveSettingsAction(null, form({ ...base, musicKey: NEW, musicStartSeconds: '0' }))).toMatchObject({ ok: true })
    expect(await getSettings()).toMatchObject({ musicKey: NEW, musicStartSeconds: 0 })
    expect(await getStorage().get(OLD)).toBeNull()
    expect(await getStorage().get(NEW)).not.toBeNull()

    expect(await saveSettingsAction(null, form({ ...base, musicKey: '', musicStartSeconds: '0' }))).toMatchObject({ ok: true })
    expect((await getSettings()).musicKey).toBeNull()
    expect(await getStorage().get(NEW)).toBeNull()
  })

  it('refuses a tampered key and keeps the saved music', async () => {
    await saveSettings({ musicKey: OLD })
    const res = await saveSettingsAction(null, form({ ...base, musicKey: '../../.env.local', musicStartSeconds: '0' }))
    expect(res).toMatchObject({ ok: false, fieldErrors: { musicKey: MUSIC_KEY_ERROR } })
    expect((await getSettings()).musicKey).toBe(OLD)
    expect(await getStorage().get(OLD)).not.toBeNull()
  })

  it('a form without the music fields (older panel) leaves the music untouched', async () => {
    await saveSettings({ musicKey: OLD, musicStartSeconds: 12 })
    expect(await saveSettingsAction(null, form(base))).toMatchObject({ ok: true })
    expect(await getSettings()).toMatchObject({ musicKey: OLD, musicStartSeconds: 12 })
    expect(await getStorage().get(OLD)).not.toBeNull()
  })
})
