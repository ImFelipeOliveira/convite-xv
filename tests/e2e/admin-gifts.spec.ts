import { expect, test, type Locator, type Page } from '@playwright/test'
import sharp from 'sharp'
import {
  countGifts,
  deleteGiftsByName,
  releaseGiftsByName,
  reserveGiftForE2eGuest,
  resetE2eGuestRsvp,
  seedGifts,
  setE2eGuestRsvp,
} from './db'
import { ADMIN_STORAGE_STATE, E2E_GUEST_NAME, E2E_GUEST_TOKEN } from './fixtures'

// sign-in is limited to 5 attempts per client IP: each admin spec uses its own fake IP
// signed in through the saved admin session (auth.setup.ts); the gate test opts out of it
test.use({ extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.26' }, storageState: ADMIN_STORAGE_STATE })

const GIFT = 'Fone sem fio'
const GIFT_EDITED = 'Fone sem fio Bluetooth'
const ORDERED = ['Ordem Zeta', 'Ordem Alfa', 'Ordem Beta', 'Ordem Gama']
const STALE = 'Presente Desatualizado'
const BROKEN_IMAGE = 'Presente Foto Quebrada'
const UPLOADED = 'Presente Com Foto Enviada'
const OWN_GIFTS = [GIFT, GIFT_EDITED, ...ORDERED, STALE, BROKEN_IMAGE, UPLOADED]
const MEDIA_SRC = /^\/media\/gifts\/[0-9a-f-]{36}\.webp$/
const AMAZON = 'https://www.amazon.com.br/dp/B0EXEMPLO1'
const IMAGE = 'https://m.media-amazon.com/images/I/exemplo.jpg'

const rowOf = (page: Page, name: string) => page.getByRole('row').filter({ hasText: name })
/** The image finished loading with real pixels (not a broken /media/ response). */
async function expectLoaded(img: Locator) {
  await expect(img).toBeVisible()
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBeGreaterThan(0)
}

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
    // live preview of a pasted photo link (a secondary, collapsed option next to the upload)
    await expect(form.getByLabel('Link da imagem')).toBeHidden()
    await form.getByText('Ou cole um link de imagem').click()
    await form.getByLabel('Link da imagem').fill(IMAGE)
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
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow')
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

  test('lists gifts by category, then order, then name (like the invite)', async ({ page }) => {
    await seedGifts([
      { name: 'Ordem Zeta', category: 'AAA Ordem 1', sortOrder: 0 },
      { name: 'Ordem Gama', category: 'AAA Ordem 2', sortOrder: 0 },
      { name: 'Ordem Beta', category: 'AAA Ordem 1', sortOrder: 2 },
      { name: 'Ordem Alfa', category: 'AAA Ordem 1', sortOrder: 2 },
    ])
    await page.goto('/admin/gifts')
    const names = page.getByRole('row').filter({ hasText: /Ordem (Zeta|Alfa|Beta|Gama)/ })
    await expect(names).toHaveCount(4)
    const order = await names.evaluateAll((rows) => rows.map((r) => r.textContent?.match(/Ordem (Zeta|Alfa|Beta|Gama)/)?.[0]))
    expect(order).toEqual(['Ordem Zeta', 'Ordem Alfa', 'Ordem Beta', 'Ordem Gama'])
    await deleteGiftsByName(ORDERED)
  })

  test('says so when the gift or reservation was already gone', async ({ page }) => {
    await seedGifts([{ name: STALE, category: 'Diversos' }])
    await reserveGiftForE2eGuest(STALE)
    await page.goto('/admin/gifts')
    const row = rowOf(page, STALE)

    // released elsewhere while the dialog was open
    await row.getByRole('button', { name: 'Liberar reserva' }).click()
    const release = page.getByRole('dialog', { name: 'Liberar reserva?' })
    await expect(release).toBeVisible()
    await releaseGiftsByName([STALE])
    await release.getByRole('button', { name: 'Liberar reserva' }).click()
    await expect(toast(page)).toContainText('Essa reserva já estava liberada.')
    await expect(release).toBeHidden()

    // deleted elsewhere while the dialog was open
    await row.getByRole('button', { name: 'Excluir' }).click()
    const del = page.getByRole('dialog', { name: 'Excluir presente?' })
    await expect(del).toBeVisible()
    await deleteGiftsByName([STALE])
    await del.getByRole('button', { name: 'Excluir' }).click()
    await expect(toast(page)).toContainText('Esse presente já tinha sido excluído.')
    await expect(del).toBeHidden()
    await expect(row).toHaveCount(0)
  })

  test('a broken photo falls back to the placeholder icon', async ({ page }) => {
    await seedGifts([{ name: BROKEN_IMAGE, category: 'Diversos', imageUrl: 'https://127.0.0.1:9/nao-existe.jpg' }])
    await page.goto('/admin/gifts')
    const row = rowOf(page, BROKEN_IMAGE)
    await expect(row.getByTestId('thumbnail-placeholder')).toBeVisible()
    await expect(row.locator('img')).toHaveCount(0)
    await deleteGiftsByName([BROKEN_IMAGE])
  })

  test('uploads a photo: preview, admin thumbnail and invite tag; removing it shows the placeholder', async ({
    page,
  }) => {
    const png = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#c25578' } })
      .png()
      .toBuffer()
    await page.goto('/admin/gifts')
    await page.getByRole('button', { name: 'Adicionar presente' }).first().click()
    const form = page.getByRole('form', { name: 'Novo presente' })
    await form.getByLabel('Nome').fill(UPLOADED)
    await form.getByLabel('Categoria').fill('Diversos')
    const photo = form.getByRole('group', { name: 'Foto do presente' })
    await expect(photo.getByRole('button', { name: 'Escolher foto' })).toBeVisible()
    await expect(photo.getByText('JPG, PNG ou WEBP, até 8 MB.')).toBeVisible()

    // a dropped file that is not an image is rejected in pt-BR (drag-and-drop on desktop)
    const dropped = await page.evaluateHandle(() => {
      const dt = new DataTransfer()
      dt.items.add(new File(['isto não é uma foto'], 'foto.jpg', { type: 'image/jpeg' }))
      return dt
    })
    await photo.getByRole('button', { name: 'Escolher foto' }).dispatchEvent('drop', { dataTransfer: dropped })
    await expect(photo.getByRole('alert')).toHaveText('Formato não suportado. Use JPG, PNG ou WEBP.')

    // picked through the file input
    await form.getByTestId('gift-photo-input').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: png })
    const preview = photo.getByRole('img', { name: 'Prévia da foto' })
    await expect(preview).toHaveAttribute('src', MEDIA_SRC)
    await expectLoaded(preview)
    await expect(photo.getByRole('alert')).toHaveText('')
    await expect(photo.getByRole('button', { name: 'Trocar foto' })).toBeFocused()
    const src = (await preview.getAttribute('src'))!
    const served = await page.request.get(src)
    expect(served.headers()['content-type']).toBe('image/webp')
    expect(served.headers()['cache-control']).toBe('public, max-age=31536000, immutable')

    await form.getByRole('button', { name: 'Salvar' }).click()
    await expect(toast(page)).toContainText('Presente salvo.')
    await expect(form).toBeHidden()
    const row = rowOf(page, UPLOADED)
    await expect(row.locator('img')).toHaveAttribute('src', src)
    await expectLoaded(row.locator('img'))

    // the invite shows it on the gift tag
    const invite = await page.context().newPage()
    await invite.goto(`/c/${E2E_GUEST_TOKEN}`)
    await invite.getByRole('button', { name: 'Entrar sem animação' }).click()
    const giftTag = invite.locator('#gifts li').filter({ hasText: UPLOADED })
    await giftTag.scrollIntoViewIfNeeded()
    await expect(giftTag.locator('img')).toHaveAttribute('src', src)
    await expectLoaded(giftTag.locator('img'))
    await invite.close()

    // remove the photo: the list falls back to the placeholder and the old object is deleted
    await row.getByRole('button', { name: 'Editar' }).click()
    const editForm = page.getByRole('form', { name: 'Editar presente' })
    const editPhoto = editForm.getByRole('group', { name: 'Foto do presente' })
    await expectLoaded(editPhoto.getByRole('img', { name: 'Prévia da foto' }))
    await editPhoto.getByRole('button', { name: 'Remover foto' }).click()
    await expect(editPhoto.getByRole('button', { name: 'Escolher foto' })).toBeFocused()
    await editForm.getByRole('button', { name: 'Salvar' }).click()
    await expect(toast(page)).toContainText('Presente salvo.')
    await expect(row.getByTestId('thumbnail-placeholder')).toBeVisible()
    await expect(row.locator('img')).toHaveCount(0)
    expect((await page.request.get(src)).status()).toBe(404)

    await deleteGiftsByName([UPLOADED])
  })

  test('the photo upload endpoint is gated without a session', async ({ playwright, baseURL }) => {
    const request = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } })
    const res = await request.post('/admin/api/gift-image', {
      multipart: { file: { name: 'a.png', mimeType: 'image/png', buffer: Buffer.from('x') } },
      maxRedirects: 0,
    })
    expect(res.status()).toBe(307)
    expect(res.headers()['location']).toMatch(/\/admin\/login$/)
  })

  test('the reserved filter says the reservation counts as confirmed', async ({ page }) => {
    // the filters only exist with a non-empty catalog
    await seedGifts([{ name: STALE, category: 'Diversos' }])
    await page.goto('/admin/gifts')
    await page.getByRole('button', { name: 'Filtros', exact: true }).click()
    const sheet = page.getByRole('dialog', { name: 'Filtros' })
    await expect(
      sheet.getByRole('group', { name: 'Situação' }).getByRole('button', { name: 'Reservado (confirmado)' }),
    ).toBeVisible()
    await deleteGiftsByName([STALE])
  })

  test('desktop: nav entry and table columns', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/admin/gifts')
    const nav = page.getByRole('navigation', { name: 'Painel' })
    const links = nav.getByRole('link')
    await expect(links).toHaveText(['Resumo', 'Convidados', 'Presentes', 'Pix', 'Recados', 'WhatsApp', 'Configurações'])
    await expect(nav.getByRole('link', { name: 'Presentes' })).toHaveAttribute('aria-current', 'page')
  })
})
