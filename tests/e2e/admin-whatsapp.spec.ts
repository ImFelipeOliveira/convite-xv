import { expect, test, type Locator, type Page } from '@playwright/test'
import { deleteGuestsByName, insertDispatch, insertGuest, resetE2eSettings } from './db'
import {
  fakeEvolutionCalls,
  fakeEvolutionState,
  resetFakeEvolution,
  setFakeEvolutionState,
} from './fake-evolution'
import { ADMIN_STORAGE_STATE } from './fixtures'

// own fake client IP (rate limits are per IP) + the saved admin session
test.use({ extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.24' }, storageState: ADMIN_STORAGE_STATE })

const SENT = 'Zé Teste'
const CLOSED = 'Zé Desconectado'
const NO_PHONE = 'Zé Sem Telefone'
const OWN_GUESTS = [SENT, CLOSED, NO_PHONE]

const rowOf = (page: Page, name: string) => page.getByRole('row').filter({ hasText: name })
const toast = (page: Page) => page.getByRole('status', { name: 'Notificações' })
const SENT_TEXT = /^Enviado \d{2}\/\d{2} \d{2}:\d{2}$/

// review screenshots (390×844): E2E_SCREENS_DIR=… pnpm test:e2e admin-whatsapp
const SCREENS = process.env.E2E_SCREENS_DIR
async function shot(target: Page | Locator, name: string, prefix = 'mobile') {
  if (SCREENS) await target.screenshot({ path: `${SCREENS}/${prefix}-${name}.png`, animations: 'disabled' })
}

async function openFilters(page: Page) {
  await page.getByRole('button', { name: /^Filtros/ }).click()
  const sheet = page.getByRole('dialog', { name: 'Filtros' })
  await expect(sheet).toBeVisible()
  return sheet
}

test.describe('admin whatsapp invite', () => {
  test.beforeAll(async () => {
    await deleteGuestsByName(OWN_GUESTS)
    await insertGuest(SENT, '+5595977776666')
    await insertGuest(CLOSED, '+5595966665555')
    await insertGuest(NO_PHONE, null)
  })
  test.afterAll(async () => {
    await deleteGuestsByName(OWN_GUESTS)
    await resetFakeEvolution('close')
  })

  test('phone: sends an invite, shows when, and asks before sending again', async ({ page }) => {
    await resetFakeEvolution('open')
    await page.goto('/admin/guests')
    await expect(page.getByRole('heading', { name: 'Convidados' })).toBeVisible()
    await shot(page, 'guests-top')
    const row = rowOf(page, SENT)

    // full-width secondary button inside the card
    const send = row.getByRole('button', { name: 'Enviar convite' })
    await expect(send).toBeVisible()
    expect(await send.evaluate((el) => getComputedStyle(el).cursor)).toBe('pointer')
    const sendBox = (await send.boundingBox())!
    const cardBox = (await row.boundingBox())!
    expect(sendBox.width).toBeGreaterThan(cardBox.width - 2 * 16 - 4)
    await row.scrollIntoViewIfNeeded()
    await shot(row, 'card-send')
    await send.click()

    await expect(toast(page)).toContainText('Convite enviado para Zé.')
    await shot(page, 'toast-success')
    await expect(row.getByText(SENT_TEXT)).toBeVisible()
    const calls = await fakeEvolutionCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0].number).toBe('5595977776666')
    expect(calls[0].text).toContain('/c/')
    expect(calls[0].text).toMatch(/^Olá, Zé!/)
    await toast(page).getByRole('button', { name: 'Fechar notificação' }).click()
    await shot(row, 'card-sent')

    // the manual alternative stays
    await expect(row.getByRole('link', { name: 'Abrir no WhatsApp' })).toHaveAttribute(
      'href',
      /^https:\/\/wa\.me\/5595977776666\?text=/,
    )

    // "Reenviar" asks first; Cancelar (or Escape) goes back without sending
    const resend = row.getByRole('button', { name: 'Reenviar convite para Zé Teste' })
    await resend.click()
    await expect(row.getByText(/Já enviado em \d{2}\/\d{2} às \d{2}:\d{2} — enviar de novo\?/)).toBeVisible()
    await shot(row, 'resend-confirm')
    await row.getByRole('button', { name: 'Cancelar' }).click()
    await expect(row.getByText(/enviar de novo\?/)).toHaveCount(0)
    await expect(resend).toBeFocused()
    await resend.click()
    await page.keyboard.press('Escape')
    await expect(row.getByText(/enviar de novo\?/)).toHaveCount(0)

    // confirming within a minute is blocked by the server: nothing sent twice
    await resend.click()
    await row.getByRole('button', { name: 'Enviar de novo' }).click()
    await expect(toast(page)).toContainText('Envio em andamento. Aguarde um minuto.')
    expect(await fakeEvolutionCalls()).toHaveLength(1)
    await toast(page).getByRole('button', { name: 'Fechar notificação' }).click()

    // "Convite" filter, in the bottom sheet on phones
    let sheet = await openFilters(page)
    await sheet.getByRole('group', { name: 'Convite' }).getByRole('button', { name: 'Enviado', exact: true }).click()
    await shot(page, 'filters-sheet')
    await sheet.getByRole('button', { name: /^Ver resultados/ }).click()
    await expect(rowOf(page, SENT)).toBeVisible()
    await expect(rowOf(page, NO_PHONE)).toHaveCount(0)
    sheet = await openFilters(page)
    await sheet.getByRole('group', { name: 'Convite' }).getByRole('button', { name: 'Não enviado', exact: true }).click()
    await sheet.getByRole('button', { name: /^Ver resultados/ }).click()
    await expect(rowOf(page, SENT)).toHaveCount(0)
    await expect(rowOf(page, NO_PHONE)).toBeVisible()
    sheet = await openFilters(page)
    await sheet.getByRole('button', { name: 'Limpar filtros' }).click()
    await page.keyboard.press('Escape')
    await expect(rowOf(page, SENT)).toBeVisible()
  })

  test('layout: no page side-scroll at any width; laptops keep Limite and Abriu', async ({ page }) => {
    await page.goto('/admin/guests')
    const row = rowOf(page, SENT)
    for (const width of [390, 768, 1024, 1280, 1440, 1536]) {
      await page.setViewportSize({ width, height: 900 })
      await expect(row.getByRole('button', { name: 'Reenviar convite para Zé Teste' })).toBeVisible()
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, `page scrolls sideways at ${width}px`).toBeLessThanOrEqual(0)
      if (width !== 390) await shot(page, `guests-${width}`, 'whatsapp')
      if (width >= 1280) {
        await expect(page.getByRole('columnheader', { name: 'Limite' })).toBeVisible()
        await expect(page.getByRole('columnheader', { name: 'Abriu o convite' })).toBeVisible()
        // one line: compact status + icon button
        await expect(row.getByText(SENT_TEXT)).toBeVisible()
      }
    }
    // wide tables scroll inside their own focusable region
    await expect(page.getByRole('region', { name: 'Tabela de convidados' })).toHaveAttribute('tabindex', '0')
  })

  test('disconnected WhatsApp shows how to fix it and marks the invite failed', async ({ page }) => {
    await resetFakeEvolution('close')
    await setFakeEvolutionState('close', { sendDelayMs: 1500 })
    await page.goto('/admin/guests')
    const row = rowOf(page, CLOSED)
    const send = row.getByRole('button', { name: 'Enviar convite' })
    await send.click()
    // pending: "Enviando…" on a disabled button until the server answers
    await expect(send).toBeDisabled()
    await expect(send).toHaveAttribute('aria-busy', 'true')
    await expect(send.getByText('Enviando…')).toBeVisible()
    await expect(toast(page)).toContainText('Conecte o WhatsApp na aba WhatsApp do painel.')
    await expect(row.getByText('Falhou', { exact: true })).toBeVisible()
    await expect(row.getByRole('button', { name: 'Tentar de novo' })).toBeVisible()

    // error toasts stay until dismissed
    await toast(page).getByRole('button', { name: 'Fechar notificação' }).click()
    const sheet = await openFilters(page)
    await sheet.getByRole('group', { name: 'Convite' }).getByRole('button', { name: 'Falhou', exact: true }).click()
    await sheet.getByRole('button', { name: /^Ver resultados/ }).click()
    await expect(rowOf(page, CLOSED)).toBeVisible()
    await expect(rowOf(page, SENT)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Filtros · 1' })).toBeVisible()
  })

  test('a guest without phone cannot be sent', async ({ page }) => {
    await page.goto('/admin/guests')
    const row = rowOf(page, NO_PHONE)
    await expect(row.getByText('Sem telefone', { exact: true })).toBeVisible()
    await expect(row.getByRole('button', { name: 'Enviar convite' })).toHaveCount(0)
  })
})

// ---------------------------------------------------------------------------------------------
// /admin/whatsapp: connection (QR) and dispatch history; reminder texts in settings

const HISTORY_A = 'Zé Histórico'
const HISTORY_B = 'Zé Lembrete'
const QR_ALT = 'QR Code para conectar o WhatsApp'
const PAGE_WIDTHS = [1280, 390] as const

const statusCard = (page: Page) => page.getByRole('region', { name: 'Conexão' })

test.describe('admin whatsapp page: gate', () => {
  test.use({ storageState: { cookies: [], origins: [] } })
  test('unauthenticated GET /admin/whatsapp redirects (307)', async ({ request }) => {
    const res = await request.get('/admin/whatsapp', { maxRedirects: 0 })
    expect(res.status()).toBe(307)
  })
})

test.describe('admin whatsapp page', () => {
  test.afterAll(async () => {
    await resetFakeEvolution('close')
  })

  for (const width of PAGE_WIDTHS) {
    test(`connects with the QR code and disconnects (${width}px)`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
      await resetFakeEvolution('close')
      await page.goto('/admin/whatsapp')
      await expect(page.getByRole('heading', { name: 'WhatsApp', level: 1 })).toBeVisible()
      const card = statusCard(page)
      await expect(card.getByText('Desconectado', { exact: true })).toBeVisible()
      await expect(card.getByText('Use um chip dedicado, não o número pessoal da família.')).toBeVisible()
      await shot(page, `disconnected-${width}`, 'whatsapp-page')

      await card.getByRole('button', { name: 'Conectar número' }).click()
      const qr = card.getByRole('img', { name: QR_ALT })
      await expect(qr).toBeVisible()
      await expect(qr).toHaveAttribute('src', /^data:image\/png;base64,/)
      const box = (await qr.boundingBox())!
      expect(box.width).toBeGreaterThanOrEqual(260)
      await expect(card.getByText('Abra o WhatsApp no celular › Aparelhos conectados › Conectar aparelho')).toBeVisible()
      const otherDevice = card.getByText(
        'Abra esta página em outro aparelho (computador ou outro celular) para escanear o QR Code.',
      )
      if (width === 390) await expect(otherDevice).toBeVisible()
      await expect(card.getByText('Conectando…', { exact: true })).toBeVisible()
      await shot(page, `qr-${width}`, 'whatsapp-page')
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, 'page scrolls sideways').toBeLessThanOrEqual(0)

      // the phone scanned it: "Já escaneei" checks right away
      await setFakeEvolutionState('open')
      await card.getByRole('button', { name: 'Já escaneei' }).click()
      await expect(card.getByText('Conectado', { exact: true })).toBeVisible()
      await expect(toast(page)).toContainText('WhatsApp conectado!')
      await expect(qr).toHaveCount(0)
      await toast(page).getByRole('button', { name: 'Fechar notificação' }).click()
      await shot(page, `connected-${width}`, 'whatsapp-page')

      // disconnect asks first, inline
      await card.getByRole('button', { name: 'Desconectar' }).click()
      await expect(card.getByText(/Desconectar este número\?/)).toBeVisible()
      await card.getByRole('button', { name: 'Cancelar' }).click()
      await expect(card.getByText('Conectado', { exact: true })).toBeVisible()
      expect((await fakeEvolutionState()).state).toBe('open')
      await card.getByRole('button', { name: 'Desconectar' }).click()
      await card.getByRole('button', { name: 'Sim, desconectar' }).click()
      await expect(card.getByText('Desconectado', { exact: true })).toBeVisible()
      await expect(toast(page)).toContainText('WhatsApp desconectado.')
      expect((await fakeEvolutionState()).state).toBe('close')
    })
  }

  test('notices the scan by itself and accepts a raw base64 QR', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await resetFakeEvolution('close')
    await setFakeEvolutionState('close', { qr: 'raw' })
    await page.goto('/admin/whatsapp')
    const card = statusCard(page)
    await card.getByRole('button', { name: 'Conectar número' }).click()
    const qr = card.getByRole('img', { name: QR_ALT })
    await expect(qr).toHaveAttribute('src', /^data:image\/png;base64,iVBOR/)
    // no click: the page polls the status every 3 s while the QR is up
    await setFakeEvolutionState('open')
    await expect(toast(page)).toContainText('WhatsApp conectado!', { timeout: 10_000 })
    await expect(card.getByText('Conectado', { exact: true })).toBeVisible()
  })

  test('a QR that is not ready yet shows a clear message', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await resetFakeEvolution('close')
    await setFakeEvolutionState('close', { qr: 'none' })
    await page.goto('/admin/whatsapp')
    const card = statusCard(page)
    await card.getByRole('button', { name: 'Conectar número' }).click()
    await expect(toast(page)).toContainText('O QR Code ainda não ficou pronto. Tente de novo em alguns segundos.', {
      timeout: 15_000,
    })
    await expect(card.getByRole('img', { name: QR_ALT })).toHaveCount(0)
  })
})

test.describe('admin whatsapp page: history', () => {
  test.beforeAll(async () => {
    await deleteGuestsByName([HISTORY_A, HISTORY_B])
    const a = await insertGuest(HISTORY_A, '+5595955554444')
    const b = await insertGuest(HISTORY_B, '+5595944443333')
    await insertDispatch(a, { kind: 'invite', status: 'sent', attempts: 1, sentAt: new Date('2026-10-18T14:30:00Z') })
    await insertDispatch(a, { kind: 'invite', status: 'failed', attempts: 1, errorCode: 'not_connected' })
    await insertDispatch(a, {
      kind: 'reminder_d7',
      status: 'scheduled',
      scheduledFor: new Date('2026-12-20T14:00:00Z'),
    })
    await insertDispatch(b, {
      kind: 'reminder_d1',
      status: 'failed',
      attempts: 3,
      errorCode: 'timeout',
      scheduledFor: new Date('2026-12-26T14:00:00Z'),
    })
    await insertDispatch(b, { kind: 'rsvp_nudge', status: 'cancelled', scheduledFor: new Date('2026-11-06T14:00:00Z') })
  })
  test.afterAll(async () => {
    await deleteGuestsByName([HISTORY_A, HISTORY_B])
    await resetE2eSettings()
  })

  test('desktop: lists dispatches, filters by kind (query param) and retries a failed reminder', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await resetFakeEvolution('open')
    await page.goto('/admin/whatsapp')
    const table = page.getByRole('region', { name: 'Tabela de envios' })
    await expect(table.getByRole('row').filter({ hasText: HISTORY_A })).toHaveCount(3)
    const sent = table.getByRole('row').filter({ hasText: 'Enviado' }).filter({ hasText: HISTORY_A })
    await expect(sent.getByText('Convite', { exact: true })).toBeVisible()
    await expect(sent.getByText('18/10 às 10:30')).toBeVisible()
    const failedInvite = table.getByRole('row').filter({ hasText: 'WhatsApp desconectado' })
    await expect(failedInvite.getByText('Falhou', { exact: true })).toBeVisible()
    await expect(failedInvite.getByRole('link', { name: /convidados/i })).toHaveAttribute('href', '/admin/guests')
    await expect(failedInvite.getByRole('button', { name: 'Tentar de novo' })).toHaveCount(0)
    await expect(table.getByRole('row').filter({ hasText: 'Lembrete 7 dias' }).getByText('20/12 às 10:00')).toBeVisible()
    await page.getByRole('heading', { name: 'Histórico de envios' }).evaluate((el) => el.scrollIntoView())
    await shot(page, 'history-1280', 'whatsapp-page')

    await expect(
      table.getByRole('row').filter({ hasText: 'Lembrete de confirmação' }).getByText('Cancelado', { exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('group', { name: 'Tipo' }).getByRole('button', { name: 'Aviso final de confirmação' }),
    ).toBeVisible()

    await page.getByRole('group', { name: 'Tipo' }).getByRole('button', { name: 'Lembrete véspera' }).click()
    await expect(page).toHaveURL(/kind=reminder_d1/)
    await expect(table.getByRole('row').filter({ hasText: HISTORY_A })).toHaveCount(0)
    const reminder = table.getByRole('row').filter({ hasText: HISTORY_B })
    await expect(reminder.getByText('Falhou', { exact: true })).toBeVisible()
    await expect(reminder.getByText('Sem resposta do WhatsApp')).toBeVisible()

    // the filter survives a reload (query param)
    await page.reload()
    await expect(
      page.getByRole('group', { name: 'Tipo' }).getByRole('button', { name: 'Lembrete véspera' }),
    ).toHaveAttribute('aria-pressed', 'true')

    await reminder.getByRole('button', { name: 'Tentar de novo' }).click()
    await expect(toast(page)).toContainText('Lembrete agendado de novo.')
    await expect(reminder.getByText('Agendado', { exact: true })).toBeVisible()
    await expect(reminder.getByRole('button', { name: 'Tentar de novo' })).toHaveCount(0)
  })

  test('phone: filters by status in the bottom sheet', async ({ page }) => {
    await page.goto('/admin/whatsapp?status=failed')
    await expect(page.getByRole('button', { name: 'Filtros · 1' })).toBeVisible()
    await expect(page.getByRole('row').filter({ hasText: 'Agendado' })).toHaveCount(0)
    const sheet = await openFilters(page)
    await sheet.getByRole('group', { name: 'Tipo' }).getByRole('button', { name: 'Convite', exact: true }).click()
    await shot(page, 'history-filters-390', 'whatsapp-page')
    await sheet.getByRole('button', { name: /^Ver resultados/ }).click()
    await expect(page).toHaveURL(/kind=invite/)
    await expect(page.getByRole('row').filter({ hasText: HISTORY_A })).toHaveCount(1)
    await page.getByRole('heading', { name: 'Histórico de envios' }).evaluate((el) => el.scrollIntoView())
    await shot(page, 'history-390', 'whatsapp-page')

    // the sheet closes by itself when the viewport grows past 640px
    await openFilters(page)
    await page.setViewportSize({ width: 800, height: 900 })
    await expect(page.getByRole('dialog', { name: 'Filtros' })).toHaveCount(0)
  })

  test('settings: reminder texts must keep {link}', async ({ page }) => {
    for (const width of PAGE_WIDTHS) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/admin/settings')
      const d7 = page.getByRole('textbox', { name: 'Lembrete 7 dias antes' })
      const d1 = page.getByRole('textbox', { name: 'Lembrete na véspera' })
      await expect(d7).toHaveValue(/\{link\}/)
      await expect(d1).toHaveValue(/\{link\}/)
      await d7.scrollIntoViewIfNeeded()
      await shot(page, `settings-reminders-${width}`, 'whatsapp-page')
    }
    const d1 = page.getByRole('textbox', { name: 'Lembrete na véspera' })
    await d1.fill('É amanhã, te esperamos!')
    await page.getByRole('button', { name: 'Salvar' }).click()
    await expect(page.getByText('A mensagem precisa conter {link}.')).toBeVisible()
    await expect(d1).toHaveAttribute('aria-invalid', 'true')
    await d1.fill('É amanhã! Detalhes: {link}')
    await page.getByRole('button', { name: 'Salvar' }).click()
    await expect(toast(page)).toContainText('Configurações salvas.')
    await page.reload()
    await expect(page.getByRole('textbox', { name: 'Lembrete na véspera' })).toHaveValue('É amanhã! Detalhes: {link}')
  })
})
