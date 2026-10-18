import { expect, test, type Page } from '@playwright/test'
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

  test('sends an invite, shows when, and asks before sending again', async ({ page }) => {
    await resetFakeEvolution('open')
    await page.goto('/admin/guests')
    const row = rowOf(page, SENT)

    const send = row.getByRole('button', { name: 'Enviar convite' })
    await expect(send).toBeVisible()
    expect(await send.evaluate((el) => getComputedStyle(el).cursor)).toBe('pointer')
    await send.click()

    await expect(toast(page)).toContainText('Convite enviado para Zé.')
    await expect(row.getByText(/Enviado em \d{2}\/\d{2} às \d{2}:\d{2}/)).toBeVisible()
    const calls = await fakeEvolutionCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0].number).toBe('5595977776666')
    expect(calls[0].text).toContain('/c/')
    expect(calls[0].text).toMatch(/^Olá, Zé!/)

    // the manual alternative stays
    await expect(row.getByRole('link', { name: 'Abrir no WhatsApp' })).toHaveAttribute(
      'href',
      /^https:\/\/wa\.me\/5595977776666\?text=/,
    )

    // "Reenviar" asks first; Cancelar (or Escape) goes back without sending
    const resend = row.getByRole('button', { name: 'Reenviar' })
    await resend.click()
    await expect(row.getByText(/Já enviado em \d{2}\/\d{2} às \d{2}:\d{2} — enviar de novo\?/)).toBeVisible()
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

    // the WhatsApp column fits without horizontal page scroll (phone, tablet, desktop)
    for (const width of [390, 768, 1024, 1280, 1536]) {
      await page.setViewportSize({ width, height: 900 })
      await expect(row.getByRole('button', { name: 'Reenviar' })).toBeVisible()
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, `horizontal scroll at ${width}px`).toBeLessThanOrEqual(0)
    }
    await page.setViewportSize({ width: 390, height: 844 })

    // "Convite" filter
    const filter = page.getByRole('group', { name: 'Convite' })
    await filter.getByRole('button', { name: 'Enviado', exact: true }).click()
    await expect(rowOf(page, SENT)).toBeVisible()
    await expect(rowOf(page, NO_PHONE)).toHaveCount(0)
    await filter.getByRole('button', { name: 'Não enviado', exact: true }).click()
    await expect(rowOf(page, SENT)).toHaveCount(0)
    await expect(rowOf(page, NO_PHONE)).toBeVisible()
    await filter.getByRole('button', { name: 'Todas', exact: true }).click()
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

    const filter = page.getByRole('group', { name: 'Convite' })
    await filter.getByRole('button', { name: 'Falhou', exact: true }).click()
    await expect(rowOf(page, CLOSED)).toBeVisible()
    await expect(rowOf(page, SENT)).toHaveCount(0)
  })

  test('a guest without phone cannot be sent', async ({ page }) => {
    await page.goto('/admin/guests')
    const row = rowOf(page, NO_PHONE)
    await expect(row.getByText('Sem telefone', { exact: true })).toBeVisible()
    await expect(row.getByRole('button', { name: 'Enviar convite' })).toHaveCount(0)
  })
})
