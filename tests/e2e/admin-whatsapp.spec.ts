import { expect, test, type Locator, type Page } from '@playwright/test'
import { deleteGuestsByName, insertGuest } from './db'
import { fakeEvolutionCalls, resetFakeEvolution, setFakeEvolutionState } from './fake-evolution'
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
