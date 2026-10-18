import { expect, test, type Page } from '@playwright/test'
import { countGifts, deleteGiftsByName, reserveGiftForE2eGuest, resetE2eGuestRsvp, setE2eGuestRsvp } from './db'
import { ADMIN_STORAGE_STATE, E2E_GUEST_NAME } from './fixtures'

// sign-in is limited to 5 attempts per client IP: each admin spec uses its own fake IP
// signed in through the saved admin session (auth.setup.ts); the gate test opts out of it
test.use({ extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.26' }, storageState: ADMIN_STORAGE_STATE })

const GIFT = 'Fone sem fio'
const GIFT_EDITED = 'Fone sem fio Bluetooth'
const OWN_GIFTS = [GIFT, GIFT_EDITED]
const AMAZON = 'https://www.amazon.com.br/dp/B0EXEMPLO1'
const IMAGE = 'https://m.media-amazon.com/images/I/exemplo.jpg'

const rowOf = (page: Page, name: string) => page.getByRole('row').filter({ hasText: name })
const toast = (page: Page) => page.getByRole('status', { name: 'Notificações' })

test.describe('admin gifts', () => {
  test.beforeAll(() => deleteGiftsByName(OWN_GIFTS))
  test.afterAll(async () => {
    await deleteGiftsByName(OWN_GIFTS)
    await resetE2eGuestRsvp()
  })

  test('gift list is gated without a session', async ({ playwright, baseURL }) => {
    const request = await playwright.request.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    })
    const res = await request.get('/admin/gifts', { maxRedirects: 0 })
    expect(res.status()).toBe(307)
    expect(res.headers()['location']).toMatch(/\/admin\/login$/)
  })

  test('creates, edits, shows a reservation, releases and deletes a gift', async ({ page }) => {
    await page.goto('/admin/gifts')
    await expect(page.getByRole('heading', { name: 'Presentes' })).toBeVisible()

    // create in a sheet
    await page.getByRole('button', { name: 'Adicionar presente' }).first().click()
    const form = page.getByRole('form', { name: 'Novo presente' })
    await expect(form).toBeVisible()
    await expect(form.getByLabel('Nome')).toBeFocused()
    await expect(form.getByText('Ex.: link da Amazon. O convidado compra onde preferir.')).toBeVisible()
    await expect(form.getByLabel('Preço aproximado')).toHaveAttribute('inputmode', 'decimal')
    await form.getByLabel('Nome').fill(GIFT)
    await form.getByLabel('Categoria').fill('Eletrônicos')
    await form.getByLabel('Preço aproximado').fill('250')

    // http links are rejected inline
    await form.getByLabel('Link de compra sugerido').fill('http://www.amazon.com.br/dp/B0EXEMPLO1')
    await form.getByRole('button', { name: 'Salvar' }).click()
    await expect(form.getByLabel('Link de compra sugerido')).toHaveAttribute('aria-invalid', 'true')
    await expect(form.getByText('Use um link que comece com https://')).toBeVisible()

    await form.getByLabel('Link de compra sugerido').fill(AMAZON)
    // live photo preview
    await form.getByLabel('Foto').fill(IMAGE)
    const preview = form.locator('img')
    await expect(preview).toHaveAttribute('src', IMAGE)
    await expect(preview).toHaveAttribute('referrerpolicy', 'no-referrer')
    await form.getByRole('button', { name: 'Salvar' }).click()
    await expect(toast(page)).toContainText('Presente salvo.')
    await expect(form).toBeHidden()

    const row = rowOf(page, GIFT)
    await expect(row).toBeVisible()
    await expect(row).toContainText('≈ R$ 250')
    await expect(row).toContainText('Eletrônicos')
    await expect(row).toContainText('Livre')
    const link = row.getByRole('link', { name: /Abrir/ })
    await expect(link).toHaveAttribute('href', AMAZON)
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', /noopener/)
    const thumb = row.locator('img')
    await expect(thumb).toHaveAttribute('referrerpolicy', 'no-referrer')
    await expect(thumb).toHaveAttribute('loading', 'lazy')

    // edit
    await row.getByRole('button', { name: 'Editar' }).click()
    const editForm = page.getByRole('form', { name: 'Editar presente' })
    await expect(editForm).toBeVisible()
    await expect(editForm.getByLabel('Preço aproximado')).toHaveValue('250')
    await editForm.getByLabel('Nome').fill(GIFT_EDITED)
    await editForm.getByLabel('Preço aproximado').fill('299,90')
    await editForm.getByRole('button', { name: 'Salvar' }).click()
    await expect(toast(page)).toContainText('Presente salvo.')
    await expect(editForm).toBeHidden()
    const edited = rowOf(page, GIFT_EDITED)
    await expect(edited).toContainText('≈ R$ 299,90')

    // reserved by the shared e2e guest
    await reserveGiftForE2eGuest(GIFT_EDITED)
    await page.reload()
    await expect(edited).toContainText(`Reservado por ${E2E_GUEST_NAME}`)
    await expect(edited).not.toContainText('recusou o convite')

    // the summary counts it
    const counts = await countGifts()
    await page.goto('/admin')
    await expect(page.getByText(`Presentes reservados ${counts.reserved} de ${counts.total}`)).toBeVisible()

    // the reserver declined the invite: flagged, and found by the filter
    await setE2eGuestRsvp('no')
    await page.goto('/admin/gifts')
    await expect(edited).toContainText(`Reservado por ${E2E_GUEST_NAME} · recusou o convite`)
    await page.getByRole('button', { name: 'Filtros', exact: true }).click()
    const sheet = page.getByRole('dialog', { name: 'Filtros' })
    await sheet
      .getByRole('group', { name: 'Situação' })
      .getByRole('button', { name: 'Reserva de quem recusou' })
      .click()
    await sheet.getByRole('button', { name: /^Ver resultados/ }).click()
    await expect(sheet).toBeHidden()
    await expect(edited).toBeVisible()
    await page.getByRole('button', { name: 'Filtros · 1' }).click()
    await sheet.getByRole('group', { name: 'Situação' }).getByRole('button', { name: 'Livre' }).click()
    await sheet.getByRole('button', { name: /^Ver resultados/ }).click()
    await expect(edited).toHaveCount(0)
    await page.getByRole('button', { name: 'Filtros · 1' }).click()
    await sheet.getByRole('button', { name: 'Limpar filtros' }).click()
    await sheet.getByRole('button', { name: /^Ver resultados/ }).click()
    await expect(edited).toBeVisible()

    // deleting a reserved gift warns about the reservation (cancel here)
    await edited.getByRole('button', { name: 'Excluir' }).click()
    const del = page.getByRole('dialog', { name: 'Excluir presente?' })
    await expect(del).toContainText(GIFT_EDITED)
    await expect(del).toContainText(`reservado por ${E2E_GUEST_NAME}`)
    await del.getByRole('button', { name: 'Cancelar' }).click()
    await expect(del).toBeHidden()

    // release the reservation (with confirmation)
    await edited.getByRole('button', { name: 'Liberar reserva' }).click()
    const release = page.getByRole('dialog', { name: 'Liberar reserva?' })
    await expect(release).toContainText(GIFT_EDITED)
    await release.getByRole('button', { name: 'Liberar reserva' }).click()
    await expect(toast(page)).toContainText('Reserva liberada.')
    await expect(release).toBeHidden()
    await expect(edited).toContainText('Livre')
    await expect(edited.getByRole('button', { name: 'Liberar reserva' })).toHaveCount(0)

    // delete (free gift: no reservation warning)
    await edited.getByRole('button', { name: 'Excluir' }).click()
    await expect(del).toContainText(GIFT_EDITED)
    await expect(del).not.toContainText('reservado por')
    await del.getByRole('button', { name: 'Excluir' }).click()
    await expect(toast(page)).toContainText('Presente excluído.')
    await expect(edited).toHaveCount(0)
  })

  test('desktop: nav entry and table columns', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/admin/gifts')
    const nav = page.getByRole('navigation', { name: 'Painel' })
    const links = nav.getByRole('link')
    await expect(links).toHaveText(['Resumo', 'Convidados', 'Presentes', 'Recados', 'WhatsApp', 'Configurações'])
    await expect(nav.getByRole('link', { name: 'Presentes' })).toHaveAttribute('aria-current', 'page')
  })
})
