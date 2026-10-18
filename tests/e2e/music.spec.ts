import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { resetE2eSettings, setE2eSettings } from './db'
import { ADMIN_STORAGE_STATE, E2E_GUEST_TOKEN } from './fixtures'

// Invite background music. The fixture is a quarter second of generated silence (never the real song,
// which is commercial and only ever lives in the bucket).
const SILENCE = path.join(__dirname, 'assets', 'silence.mp3')
// the e2e server stores media under MEDIA_DIR=.data/media (playwright.config.ts), relative to the repo root
const MEDIA_DIR = path.join(process.cwd(), '.data', 'media')
const MUSIC_SRC = /^\/media\/music\/[0-9a-f-]{36}\.mp3$/
const invitePath = `/c/${E2E_GUEST_TOKEN}`

const toast = (page: Page) => page.getByRole('status', { name: 'Notificações' })

test.describe('admin: invite music', () => {
  test.use({ extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.81' }, storageState: ADMIN_STORAGE_STATE })
  test.afterAll(() => resetE2eSettings())

  test('uploads an mp3, previews it, saves; then removes it', async ({ page }) => {
    await page.goto('/admin/settings')
    const group = page.getByRole('group', { name: 'Arquivo de áudio' })
    await expect(group.getByRole('button', { name: 'Escolher música' })).toBeVisible()
    await expect(group.getByText('MP3 ou M4A, até 8 MB.')).toBeVisible()

    // a file that only claims to be an mp3 is refused by its content, in pt-BR
    await page.getByTestId('music-input').setInputFiles({
      name: 'musica.mp3',
      mimeType: 'audio/mpeg',
      buffer: Buffer.from('isto não é uma música'),
    })
    await expect(group.getByRole('alert')).toHaveText('Formato não suportado. Use MP3 ou M4A.')

    await page.getByTestId('music-input').setInputFiles(SILENCE)
    const preview = page.getByTestId('music-preview')
    await expect(preview).toHaveAttribute('src', MUSIC_SRC)
    await expect(preview).toHaveAttribute('controls', '')
    await expect(toast(page)).toContainText('Música enviada.')
    await expect(group.getByRole('alert')).toHaveText('')
    await expect(group.getByText('Nova música, ainda não salva.')).toBeVisible()
    await expect(group.getByRole('button', { name: 'Trocar música' })).toBeFocused()
    const src = (await preview.getAttribute('src'))!

    // served as audio with byte ranges (iOS Safari)
    const full = await page.request.get(src)
    expect(full.status()).toBe(200)
    expect(full.headers()['content-type']).toBe('audio/mpeg')
    expect(full.headers()['accept-ranges']).toBe('bytes')
    expect((await full.body()).equals(await readFile(SILENCE))).toBe(true)
    const probe = await page.request.get(src, { headers: { range: 'bytes=0-1' } })
    expect(probe.status()).toBe(206)
    expect(probe.headers()['content-range']).toBe('bytes 0-1/960')

    await page.getByLabel('Começar em (segundos)').fill('2')
    await page.getByRole('button', { name: 'Salvar' }).click()
    await expect(toast(page)).toContainText('Configurações salvas.')

    // after a reload the saved file is still there
    await page.reload()
    await expect(page.getByTestId('music-preview')).toHaveAttribute('src', src)
    await expect(page.getByLabel('Começar em (segundos)')).toHaveValue('2')
    await expect(group.getByText('Toca no convite depois que o envelope é aberto.')).toBeVisible()

    // removing asks first; cancel keeps it
    await group.getByRole('button', { name: 'Remover música' }).click()
    const dialog = page.getByRole('dialog', { name: 'Remover a música?' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancelar' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByTestId('music-preview')).toBeVisible()

    await group.getByRole('button', { name: 'Remover música' }).click()
    await page.getByRole('dialog', { name: 'Remover a música?' }).getByRole('button', { name: 'Remover' }).click()
    await expect(toast(page)).toContainText('Música removida.')
    await expect(group.getByRole('button', { name: 'Escolher música' })).toBeFocused()
    await expect(page.getByTestId('music-preview')).toHaveCount(0)
    await page.getByRole('button', { name: 'Salvar' }).click()
    await expect(toast(page)).toContainText('Configurações salvas.')

    await page.reload()
    await expect(group.getByRole('button', { name: 'Escolher música' })).toBeVisible()
    await expect(page.getByTestId('music-preview')).toHaveCount(0)
    // the replaced file is gone from storage
    expect((await page.request.get(src)).status()).toBe(404)
  })

  test('the music upload endpoint is gated without a session', async ({ playwright, baseURL }) => {
    const request = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } })
    const res = await request.post('/admin/api/music', {
      multipart: { file: { name: 'a.mp3', mimeType: 'audio/mpeg', buffer: await readFile(SILENCE) } },
      maxRedirects: 0,
    })
    expect(res.status()).toBe(307)
    expect(res.headers()['location']).toMatch(/\/admin\/login$/)
  })
})

test.describe('invite: background music', () => {
  test.use({ extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.82' } })
  const key = `music/${crypto.randomUUID()}.mp3`

  test.beforeAll(async () => {
    await mkdir(path.join(MEDIA_DIR, 'music'), { recursive: true })
    await writeFile(path.join(MEDIA_DIR, key), await readFile(SILENCE))
  })
  test.afterAll(async () => {
    await resetE2eSettings()
    await rm(path.join(MEDIA_DIR, key), { force: true })
  })

  test('starts with the envelope, toggles with aria-pressed and remembers a pause', async ({ page }) => {
    await setE2eSettings({ musicKey: key, musicStartSeconds: 0 })
    await page.goto(invitePath)
    const audio = page.getByTestId('invite-music')
    // nothing is downloaded before the open gesture
    await expect(audio).toHaveAttribute('preload', 'none')
    await expect(page.getByRole('button', { name: /música/ })).toHaveCount(0)

    await page.getByRole('button', { name: 'Abrir o convite' }).click()
    const pause = page.getByRole('button', { name: 'Pausar música' })
    await expect(pause).toBeVisible({ timeout: 5000 })
    await expect(pause).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => !el.paused && el.loop)).toBe(true)

    await pause.click()
    const play = page.getByRole('button', { name: 'Tocar música' })
    await expect(play).toHaveAttribute('aria-pressed', 'false')
    expect(await audio.evaluate((el: HTMLAudioElement) => el.paused)).toBe(true)

    await play.click()
    await expect(page.getByRole('button', { name: 'Pausar música' })).toHaveAttribute('aria-pressed', 'true')

    // paused, then back later (envelope skipped): no auto-start, the toggle still plays it
    await page.getByRole('button', { name: 'Pausar música' }).click()
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Isabella' })).toBeVisible()
    const again = page.getByRole('button', { name: 'Tocar música' })
    await expect(again).toHaveAttribute('aria-pressed', 'false')
    expect(await page.getByTestId('invite-music').evaluate((el: HTMLAudioElement) => el.paused)).toBe(true)
    await again.click()
    await expect(page.getByRole('button', { name: 'Pausar música' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('a guest who paused before is not greeted by music when opening the envelope', async ({ page }) => {
    await setE2eSettings({ musicKey: key, musicStartSeconds: 0 })
    await page.addInitScript(() => window.localStorage.setItem('xv:music-paused', '1'))
    await page.goto(invitePath)
    await page.getByRole('button', { name: 'Entrar sem animação' }).click()
    const play = page.getByRole('button', { name: 'Tocar música' })
    await expect(play).toHaveAttribute('aria-pressed', 'false')
    expect(await page.getByTestId('invite-music').evaluate((el: HTMLAudioElement) => el.paused)).toBe(true)
  })

  test('no music configured: no toggle and no audio element', async ({ page }) => {
    await resetE2eSettings()
    await page.goto(invitePath)
    await page.getByRole('button', { name: 'Abrir o convite' }).click()
    await expect(page.getByRole('heading', { name: 'Isabella' })).toBeVisible({ timeout: 3000 })
    await expect(page.getByRole('button', { name: /música/ })).toHaveCount(0)
    await expect(page.locator('audio')).toHaveCount(0)
  })
})
