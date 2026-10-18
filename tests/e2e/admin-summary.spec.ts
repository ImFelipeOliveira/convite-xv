import { expect, test } from '@playwright/test'
import { deleteGuestsByName, resetE2eGuestRsvp, resetE2eSettings } from './db'
import { ADMIN_STORAGE_STATE, E2E_GUEST_NAME, E2E_GUEST_TOKEN } from './fixtures'

// sign-in is limited to 5 attempts per client IP: each admin spec uses its own fake IP
// signed in through the saved admin session (auth.setup.ts); the gate test opts out of it
test.use({ extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.23' }, storageState: ADMIN_STORAGE_STATE })

const OWN_GUESTS = ['Resumo Sim Um', 'Resumo Sim Dois', 'Resumo Aberto']

/** Same limit as MAX_DEADLINE in src/features/settings/schema.ts (the day before the party). */
const MAX_DEADLINE = '2026-12-26'
const DAY_MS = 24 * 60 * 60 * 1000

/** 'YYYY-MM-DD' in Boa Vista (UTC−4, no DST) `days` from now. */
function boaVistaDate(days: number): string {
  return new Date(Date.now() - 4 * 60 * 60 * 1000 + days * DAY_MS).toISOString().slice(0, 10)
}

function addDays(date: string, days: number): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10)
}

// a valid future deadline (never past MAX_DEADLINE), a preferred date after it (invalid) and one on it
const DEADLINE = [boaVistaDate(7), MAX_DEADLINE].sort()[0]
const AFTER_DEADLINE = addDays(DEADLINE, 1)
const DEADLINE_DDMM = `${DEADLINE.slice(8, 10)}\\/${DEADLINE.slice(5, 7)}`

test.describe('admin summary, messages and settings', () => {
  test.afterAll(async () => {
    await deleteGuestsByName(OWN_GUESTS)
    await resetE2eGuestRsvp()
    await resetE2eSettings()
  })

  test('messages and settings are gated without a session', async ({ playwright, baseURL }) => {
    const request = await playwright.request.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    })
    for (const path of ['/admin/messages', '/admin/settings']) {
      const res = await request.get(path, { maxRedirects: 0 })
      expect(res.status(), path).toBe(307)
      expect(res.headers()['location']).toMatch(/\/admin\/login$/)
      const body = await res.text()
      expect(body).not.toContain(E2E_GUEST_NAME)
      expect(body).not.toContain(E2E_GUEST_TOKEN)
    }
  })

  test('summary and messages', async ({ page, browser }) => {
    // two confirmed (one with 2 plus-ones) + one pending guest who opened the invite
    await page.goto('/admin/guests')
    for (const [name, limit] of [
      ['Resumo Sim Um', '0'],
      ['Resumo Sim Dois', '2'],
      ['Resumo Aberto', '0'],
    ]) {
      await page.getByRole('button', { name: 'Adicionar convidado' }).first().click()
      const form = page.getByRole('form', { name: 'Novo convidado' })
      await form.getByLabel('Nome').fill(name)
      await form.getByLabel('Limite de acompanhantes').fill(limit)
      await form.getByRole('button', { name: 'Salvar' }).click()
      await expect(form).toBeHidden()
      await expect(page.getByRole('row').filter({ hasText: name })).toBeVisible()
    }
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    const tokens: Record<string, string> = {}
    for (const name of OWN_GUESTS) {
      const row = page.getByRole('row').filter({ hasText: name })
      await row.getByRole('button', { name: 'Copiar link' }).click()
      tokens[name] = (await page.evaluate(() => navigator.clipboard.readText())).split('/c/')[1]
    }

    // each guest gets a fresh context: the opening animation is skipped on a repeat visit
    const openInvite = async (name: string) => {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
      const guest = await ctx.newPage()
      await guest.goto(`/c/${tokens[name]}`)
      await guest.getByRole('button', { name: 'Entrar sem animação' }).click()
      return { guest, ctx }
    }

    let { guest, ctx } = await openInvite('Resumo Sim Um')
    await guest.locator('#rsvp').getByText('Vou com certeza').click()
    await guest.locator('#rsvp').getByRole('button', { name: 'Confirmar presença' }).click()
    await expect(guest.getByRole('heading', { name: 'Presença confirmada.' })).toBeVisible()
    await ctx.close()

    ;({ guest, ctx } = await openInvite('Resumo Sim Dois'))
    const rsvp = guest.locator('#rsvp')
    await rsvp.getByText('Vou com certeza').click()
    const add = rsvp.getByRole('button', { name: 'Adicionar acompanhante' })
    await add.click()
    await add.click()
    await rsvp.getByLabel(/recado/i).fill('Mal posso esperar!')
    await rsvp.getByRole('button', { name: 'Confirmar presença' }).click()
    await expect(guest.getByRole('heading', { name: 'Presença confirmada.' })).toBeVisible()

    await ctx.close()

    ;({ ctx } = await openInvite('Resumo Aberto'))
    await ctx.close()

    // summary
    await page.goto('/admin')
    await expect(page.getByRole('heading', { name: 'Resumo' })).toBeVisible()
    await expect(page.getByText('Pessoas confirmadas').locator('..')).toContainText('4')
    await expect(page.getByRole('progressbar', { name: /Confirmados/ })).toBeVisible()
    const opened = page.getByRole('region', { name: 'Abriram e não responderam' })
    await expect(opened.getByText('Resumo Aberto')).toBeVisible()
    await expect(opened.getByText('Resumo Sim Um')).toHaveCount(0)

    // messages
    await page.goto('/admin/messages')
    await expect(page.getByRole('heading', { name: 'Recados' })).toBeVisible()
    const item = page.getByRole('listitem').filter({ hasText: 'Mal posso esperar!' })
    await expect(item).toContainText('Resumo Sim Dois')
    await expect(item).toContainText('Confirmou')
  })

  test('deadline setting: validation and the invite', async ({ page }) => {
    await page.goto('/admin/settings')
    const settingsForm = page.getByRole('form', { name: 'Configurações' })
    const fieldset = settingsForm.locator('fieldset')
    const deadline = settingsForm.getByLabel('Prazo para confirmar')
    const preferred = settingsForm.getByLabel('Confirmar de preferência até')
    const template = settingsForm.getByLabel('Mensagem do WhatsApp')
    /** Saves and waits until the action finished (fieldset enabled again). */
    const save = async () => {
      await settingsForm.getByRole('button', { name: 'Salvar' }).click()
      await expect(fieldset).toBeEnabled()
    }

    await expect(fieldset).toBeEnabled()
    await deadline.fill(DEADLINE)
    // the stored preferred date (default 21/11) may fall after a near deadline: keep it on the deadline
    await preferred.fill(DEADLINE)
    await save()
    await expect(page.getByRole('status', { name: 'Notificações' })).toContainText('Configurações salvas.')
    // after React's post-action form reset the fields show the saved values
    await expect(deadline).toHaveValue(DEADLINE)
    await expect(preferred).toHaveValue(DEADLINE)

    // the preferred date can't be after the deadline
    await preferred.fill(AFTER_DEADLINE)
    await save()
    await expect(page.getByText('A data de preferência deve ser até o prazo para confirmar.')).toBeVisible()
    await expect(deadline).toHaveValue(DEADLINE)
    await expect(preferred).toHaveValue(AFTER_DEADLINE)
    await preferred.fill(DEADLINE)
    await expect(preferred).toHaveValue(DEADLINE)

    await template.fill('Sem o link')
    await save()
    await expect(page.getByText('A mensagem precisa conter {link}.')).toBeVisible()
    await expect(template).toHaveValue('Sem o link')

    // only the first save went through: the invite shows that deadline

    await page.goto(`/c/${E2E_GUEST_TOKEN}`)
    await page.getByRole('button', { name: 'Entrar sem animação' }).click()
    await expect(page.locator('#rsvp').getByText(new RegExp(`(O prazo final é|responda até) ${DEADLINE_DDMM}\\.`))).toBeVisible()
  })
})
