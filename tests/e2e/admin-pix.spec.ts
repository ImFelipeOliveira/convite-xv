import { expect, test, type Browser, type Page } from '@playwright/test'
import { deletePixFixtures, resetE2eSettings, seedPixPayments, type SeedPix } from './db'
import { ADMIN_STORAGE_STATE } from './fixtures'

// sign-in is limited to 5 attempts per client IP: each admin spec uses its own fake IP
// signed in through the saved admin session (auth.setup.ts); the gate test opts out of it
test.use({ extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.27' }, storageState: ADMIN_STORAGE_STATE })

const DAY_MS = 24 * 60 * 60 * 1000
const tok = (n: number) => `PixAdmin${String(n).padStart(14, '0')}`

const PAID: SeedPix = { guestName: 'Ana Pix Pago', token: tok(1), amountCents: 15000, status: 'paid', createdAt: new Date(Date.now() - 2 * DAY_MS) }
const REFUNDED: SeedPix = { guestName: 'Bruno Pix Estornado', token: tok(2), amountCents: 10000, status: 'paid', refundedAt: new Date() }
const PENDING: SeedPix = {
  guestName: 'Carla Pix Aguardando',
  token: tok(3),
  amountCents: 20000,
  status: 'pending',
  expiresAt: new Date(Date.now() + DAY_MS),
  withQr: true,
}
const EXPIRED: SeedPix = { guestName: 'Davi Pix Expirado', token: tok(4), amountCents: 7000, status: 'expired' }
const CANCELLED: SeedPix = { guestName: 'Elisa Pix Cancelado', token: tok(5), amountCents: 8000, status: 'cancelled' }
const FAILED: SeedPix = { guestName: 'Fabio Pix Falhou', token: tok(6), amountCents: 9000, status: 'failed' }
const SEED = [PAID, REFUNDED, PENDING, EXPIRED, CANCELLED, FAILED]
const TOKENS = SEED.map((p) => p.token)

const rowOf = (page: Page, name: string) => page.getByRole('row').filter({ hasText: name })

/** The invite's Pix section for `token`, in a fresh context (a guest, not the admin). */
async function openInvitePix(browser: Browser, token: string) {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] }, viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  await page.setExtraHTTPHeaders({ 'x-forwarded-for': '203.0.113.28' })
  await page.goto(`/c/${token}`)
  await page.getByRole('button', { name: 'Entrar sem animação' }).click()
  const section = page.locator('#pix')
  await section.scrollIntoViewIfNeeded()
  return { ctx, section }
}

test.describe('admin pix', () => {
  test.beforeAll(() => seedPixPayments(SEED))
  test.afterAll(async () => {
    await deletePixFixtures(TOKENS)
    await resetE2eSettings()
  })

  test('the Pix page is gated without a session', async ({ playwright, baseURL }) => {
    const request = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } })
    const res = await request.get('/admin/pix', { maxRedirects: 0 })
    expect(res.status()).toBe(307)
    expect(res.headers()['location']).toMatch(/\/admin\/login$/)
    expect(await res.text()).not.toContain(PAID.guestName)
  })

  test('lists every payment with values, badges and totals; filters by situation', async ({ page }) => {
    await page.goto('/admin')
    await expect(page.getByText('Pix recebidos: 1 · R$ 150,00')).toBeVisible()
    await page.getByRole('link', { name: /Pix recebidos/ }).click()
    await expect(page.getByRole('heading', { name: 'Pix', exact: true })).toBeVisible()

    // nav item
    await page.getByRole('button', { name: 'Abrir menu' }).click()
    await expect(page.getByRole('dialog', { name: 'Menu' }).getByRole('link', { name: 'Pix' })).toHaveAttribute('aria-current', 'page')
    await page.getByRole('button', { name: 'Fechar menu' }).click()

    // totals: received excludes the refund; pending only counts still payable QRs
    await expect(page.getByText('Recebido', { exact: true }).locator('..')).toContainText('R$ 150,00')
    await expect(page.getByText('Pendente', { exact: true }).locator('..')).toContainText('R$ 200,00')

    for (const [p, value, badge] of [
      [PAID, 'R$ 150,00', 'Pago'],
      [REFUNDED, 'R$ 100,00', 'Estornado'],
      [PENDING, 'R$ 200,00', 'Aguardando'],
      [EXPIRED, 'R$ 70,00', 'Expirado'],
      [CANCELLED, 'R$ 80,00', 'Cancelado'],
      [FAILED, 'R$ 90,00', 'Falhou'],
    ] as const) {
      const row = rowOf(page, p.guestName)
      await expect(row, p.guestName).toContainText(value)
      await expect(row.getByText(badge, { exact: true }), p.guestName).toBeVisible()
    }
    // created and paid times (Boa Vista): two on a paid row, one on a pending row (its "Pago em" is "—")
    const when = /\d{2}\/\d{2} às \d{2}:\d{2}/g
    expect((await rowOf(page, PAID.guestName).innerText()).match(when)).toHaveLength(2)
    expect((await rowOf(page, PENDING.guestName).innerText()).match(when)).toHaveLength(1)

    // filter: Pago (phones: in the "Filtros" sheet)
    await page.getByRole('button', { name: 'Filtros', exact: true }).click()
    const sheet = page.getByRole('dialog', { name: 'Filtros' })
    await sheet.getByRole('group', { name: 'Situação' }).getByRole('button', { name: 'Pago', exact: true }).click()
    await sheet.getByRole('button', { name: /^Ver resultados/ }).click()
    await expect(sheet).toBeHidden()
    await expect(rowOf(page, PAID.guestName)).toBeVisible()
    for (const p of [REFUNDED, PENDING, EXPIRED, CANCELLED, FAILED]) await expect(rowOf(page, p.guestName)).toHaveCount(0)
  })

  test('shows the table columns on a wide screen', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/admin/pix')
    for (const name of ['Convidado', 'Valor', 'Situação', 'Criado em', 'Pago em']) {
      await expect(page.getByRole('columnheader', { name })).toBeVisible()
    }
  })

  test('settings: receiver name under the QR and the thanks message on the paid screen', async ({ page, browser }) => {
    // defaults
    let invite = await openInvitePix(browser, PENDING.token)
    await expect(invite.section.getByText('Felipe Oliveira Souza · Asaas')).toBeVisible()
    await invite.ctx.close()

    await page.goto('/admin/settings')
    const form = page.getByRole('form', { name: 'Configurações' })
    await expect(form.getByLabel('Nome de quem recebe')).toHaveValue('Felipe Oliveira Souza')
    await expect(form.getByText('Aparece como “Felipe Oliveira Souza · Asaas”', { exact: false })).toBeVisible()
    await form.getByLabel('Nome de quem recebe').fill('Maria E2E Souza')
    // the preview follows the typing
    await expect(form.getByText('Aparece como “Maria E2E Souza · Asaas”', { exact: false })).toBeVisible()
    await form.getByLabel('Mensagem de agradecimento do Pix').fill('Obrigada, de coração! E2E')
    await form.getByRole('button', { name: 'Salvar' }).click()
    await expect(page.getByRole('status', { name: 'Notificações' })).toContainText('Configurações salvas.')

    // too long: refused inline
    await form.getByLabel('Mensagem de agradecimento do Pix').evaluate((el) => el.removeAttribute('maxlength'))
    await form.getByLabel('Mensagem de agradecimento do Pix').fill('a'.repeat(401))
    await form.getByRole('button', { name: 'Salvar' }).click()
    await expect(form.getByText('Use até 400 caracteres.')).toBeVisible()

    invite = await openInvitePix(browser, PENDING.token)
    await expect(invite.section.getByText('Maria E2E Souza · Asaas')).toBeVisible()
    await invite.ctx.close()

    invite = await openInvitePix(browser, PAID.token)
    await expect(invite.section.getByRole('heading', { name: 'Pix recebido.' })).toBeVisible()
    await expect(invite.section.getByText('Obrigada, de coração! E2E')).toBeVisible()
    await invite.ctx.close()
  })
})
