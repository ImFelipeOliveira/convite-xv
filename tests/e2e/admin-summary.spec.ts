import { expect, test, type Page } from '@playwright/test'
import { deleteGuestsByName, resetE2eGuestRsvp, resetE2eSettings } from './db'
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_GUEST_NAME, E2E_GUEST_TOKEN } from './fixtures'

const OWN_GUESTS = ['Resumo Sim Um', 'Resumo Sim Dois', 'Resumo Aberto']

async function signIn(page: Page) {
  await page.goto('/admin/login')
  await page.getByLabel('E-mail').fill(E2E_ADMIN_EMAIL)
  await page.getByLabel('Senha').fill(E2E_ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).toHaveURL(/\/admin$/)
}

test.describe('admin summary, messages and settings', () => {
  test.afterAll(async () => {
    await deleteGuestsByName(OWN_GUESTS)
    await resetE2eGuestRsvp()
    await resetE2eSettings()
  })

  test('messages and settings are gated without a session', async ({ request }) => {
    for (const path of ['/admin/messages', '/admin/settings']) {
      const res = await request.get(path, { maxRedirects: 0 })
      expect(res.status(), path).toBe(307)
      expect(res.headers()['location']).toMatch(/\/admin\/login$/)
      const body = await res.text()
      expect(body).not.toContain(E2E_GUEST_NAME)
      expect(body).not.toContain(E2E_GUEST_TOKEN)
    }
  })

  test('summary, messages and deadline setting', async ({ page, browser }) => {
    await signIn(page)

    // two confirmed (one with 2 plus-ones) + one pending guest who opened the invite
    await page.goto('/admin/guests')
    const form = page.getByRole('form', { name: 'Novo convidado' })
    for (const [name, limit] of [
      ['Resumo Sim Um', '0'],
      ['Resumo Sim Dois', '2'],
      ['Resumo Aberto', '0'],
    ]) {
      await form.getByLabel('Nome').fill(name)
      await form.getByLabel('Limite de acompanhantes').fill(limit)
      await form.getByRole('button', { name: 'Adicionar convidado' }).click()
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
    await expect(page.getByRole('heading', { name: 'Painel' })).toBeVisible()
    await expect(page.getByText('Pessoas confirmadas').locator('..')).toContainText('4')
    const opened = page.getByRole('region', { name: 'Abriram e não responderam' })
    await expect(opened.getByText('Resumo Aberto')).toBeVisible()
    await expect(opened.getByText('Resumo Sim Um')).toHaveCount(0)

    // messages
    await page.goto('/admin/messages')
    await expect(page.getByRole('heading', { name: 'Recados' })).toBeVisible()
    const item = page.getByRole('listitem').filter({ hasText: 'Mal posso esperar!' })
    await expect(item).toContainText('Resumo Sim Dois')
    await expect(item).toContainText('Confirmou')

    // settings: deadline reflected on the invite
    await page.goto('/admin/settings')
    const settingsForm = page.getByRole('form', { name: 'Configurações' })
    await settingsForm.getByLabel('Prazo para confirmar').fill('2026-12-10')
    await settingsForm.getByRole('button', { name: 'Salvar' }).click()
    await expect(page.getByText('Configurações salvas.')).toBeVisible()

    await settingsForm.getByLabel('Mensagem do WhatsApp').fill('Sem o link')
    await settingsForm.getByRole('button', { name: 'Salvar' }).click()
    await expect(page.getByText('A mensagem precisa conter {link}.')).toBeVisible()

    await page.goto(`/c/${E2E_GUEST_TOKEN}`)
    await page.getByRole('button', { name: 'Entrar sem animação' }).click()
    await expect(page.locator('#rsvp').getByText(/responda até 10\/12/)).toBeVisible()
  })
})
