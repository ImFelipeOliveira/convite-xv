import { expect, test, type Locator, type Page } from '@playwright/test'
import { deleteGuestsByName, seedGuests } from './db'
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_GUEST_NAME, E2E_GUEST_TOKEN } from './fixtures'

// sign-in is limited to 5 attempts per client IP: each admin spec uses its own fake IP
test.use({ extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.22' } })

const CSV = '﻿nome;telefone;limite_acompanhantes\nJoão Ávila;(95) 99123-4567;2\nMaria;;0\n\nPedro;123;1\n'
const OWN_GUESTS = ['Ana Teste', 'João Ávila', 'Maria', 'Pedro', 'Paginação Nova']
const SEED_PREFIX = 'Paginação'

async function signIn(page: Page) {
  await page.goto('/admin/login')
  await page.getByLabel('E-mail').fill(E2E_ADMIN_EMAIL)
  await page.getByLabel('Senha', { exact: true }).fill(E2E_ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).toHaveURL(/\/admin$/)
}

const rowOf = (page: Page, name: string) => page.getByRole('row').filter({ hasText: name })
const toast = (page: Page) => page.getByRole('status', { name: 'Notificações' })
const cursorOf = (l: Locator) => l.evaluate((el) => getComputedStyle(el).cursor)

async function openNewGuestSheet(page: Page) {
  await page.getByRole('button', { name: 'Adicionar convidado' }).first().click()
  const form = page.getByRole('form', { name: 'Novo convidado' })
  await expect(form).toBeVisible()
  return form
}

test.describe('admin guests', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] })
  test.afterAll(() => deleteGuestsByName(OWN_GUESTS))

  test('guest list and export are gated without a session', async ({ request }) => {
    for (const path of ['/admin/guests', '/admin/guests/export', '/admin/whatsapp']) {
      const res = await request.get(path, { maxRedirects: 0 })
      expect(res.status(), path).toBe(307)
      expect(res.headers()['location']).toMatch(/\/admin\/login$/)
      const body = await res.text()
      expect(body).not.toContain(E2E_GUEST_NAME)
      expect(body).not.toContain(E2E_GUEST_TOKEN)
    }
  })

  test('creates, copies link, edits, imports CSV and deletes', async ({ page }) => {
    await signIn(page)
    await page.goto('/admin/guests')
    await expect(page.getByRole('heading', { name: 'Convidados' })).toBeVisible()

    // create in a sheet over the list
    const form = await openNewGuestSheet(page)
    await expect(form.getByLabel('Nome')).toBeFocused()
    await form.getByLabel('Nome').fill('Ana Teste')
    await form.getByLabel('Telefone').fill('(95) 98888-7777')
    await form.getByLabel('Limite de acompanhantes').fill('1')
    await form.getByRole('button', { name: 'Salvar' }).click()
    await expect(toast(page)).toContainText('Convidado adicionado.')
    await expect(form).toBeHidden()
    const ana = rowOf(page, 'Ana Teste')
    await expect(ana).toBeVisible()
    await expect(ana).toContainText('(95) 98888-7777')

    // copy invite link: toast instead of a silent copy
    await ana.getByRole('button', { name: 'Copiar link' }).click()
    await expect(toast(page)).toContainText('Link copiado')
    const copied = await page.evaluate(() => navigator.clipboard.readText())
    expect(copied).toMatch(/^http:\/\/localhost:\d+\/c\/[0-9A-Za-z]{22}$/)

    // WhatsApp link opens in a new tab with the guest's number
    const wa = ana.getByRole('link', { name: 'Enviar pelo WhatsApp' })
    await expect(wa).toHaveAttribute('target', '_blank')
    await expect(wa).toHaveAttribute('href', /^https:\/\/wa\.me\/5595988887777\?text=/)

    // edit in the sheet: the URL stays on the list
    await ana.getByRole('button', { name: 'Editar' }).click()
    const editForm = page.getByRole('form', { name: 'Editar convidado' })
    await expect(editForm).toBeVisible()
    await expect(page).toHaveURL(/\/admin\/guests$/)
    await editForm.getByLabel('Limite de acompanhantes').fill('3')
    await editForm.getByRole('button', { name: 'Salvar' }).click()
    await expect(toast(page)).toContainText('Convidado atualizado.')
    await expect(editForm).toBeHidden()
    await expect(rowOf(page, 'Ana Teste').getByRole('cell').nth(2)).toHaveText('3')

    // import CSV in a sheet; the report stays visible until closed
    await page.getByRole('button', { name: 'Importar planilha' }).click()
    const importForm = page.getByRole('form', { name: 'Importar convidados' })
    await importForm.getByLabel('Arquivo CSV').setInputFiles({
      name: 'convidados.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(CSV, 'utf-8'),
    })
    await importForm.getByRole('button', { name: 'Importar' }).click()
    await expect(page.getByText('2 importados, 1 erro (linha 5: Telefone inválido)')).toBeVisible()
    await expect(toast(page)).toContainText('2 convidados importados')
    await page
      .getByRole('dialog', { name: 'Importar planilha' })
      .getByRole('button', { name: 'Fechar' })
      .click()
    await expect(rowOf(page, 'João Ávila')).toBeVisible()
    await expect(rowOf(page, 'Maria')).toBeVisible()
    await expect(rowOf(page, 'Pedro')).toHaveCount(0)

    // delete through an accessible confirmation dialog
    const deleteMaria = rowOf(page, 'Maria').getByRole('button', { name: 'Excluir' })
    await deleteMaria.click()
    const dialog = page.getByRole('dialog', { name: 'Excluir convidado?' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Maria')
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(deleteMaria).toBeFocused()
    await deleteMaria.click()
    await dialog.getByRole('button', { name: 'Excluir' }).click()
    await expect(toast(page)).toContainText('Convidado excluído.')
    await expect(rowOf(page, 'Maria')).toHaveCount(0)
    await expect(rowOf(page, E2E_GUEST_NAME)).toBeVisible()

    // accent-insensitive search
    const search = page.getByLabel('Buscar')
    await search.fill('ana')
    await expect(rowOf(page, 'Ana Teste')).toBeVisible()
    await expect(rowOf(page, 'João Ávila')).toHaveCount(0)
    await search.fill('Ána')
    await expect(rowOf(page, 'Ana Teste')).toBeVisible()
    await expect(rowOf(page, E2E_GUEST_NAME)).toHaveCount(0)
    await search.fill('')

    // status filter chips
    const filters = page.getByRole('group', { name: 'Resposta' })
    await filters.getByRole('button', { name: 'Sim', exact: true }).click()
    await expect(rowOf(page, 'Ana Teste')).toHaveCount(0)
    await filters.getByRole('button', { name: 'Todas', exact: true }).click()
    await expect(rowOf(page, 'Ana Teste')).toBeVisible()

    // export
    const res = await page.request.get('/admin/guests/export', { maxRedirects: 0 })
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toBe('text/csv; charset=utf-8')
    expect(res.headers()['content-disposition']).toContain('convidados.csv')
    const csv = await res.text()
    expect(csv).toContain('nome;telefone;limite_acompanhantes;resposta')
    expect(csv).toContain('Ana Teste;(95) 98888-7777;3;Pendente')
  })

  test.describe('data table', () => {
    let seeded: string[] = []
    test.beforeAll(async () => {
      seeded = await seedGuests(SEED_PREFIX, 25, 3)
    })
    test.afterAll(() => deleteGuestsByName(seeded))

    test('desktop: sidebar, pointer cursors, sorting, filter, pagination and sheet keeps search', async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 800 })
      await signIn(page)
      await page.goto('/admin/guests')

      // shell
      const nav = page.getByRole('navigation', { name: 'Painel' })
      for (const name of ['Resumo', 'Convidados', 'Recados', 'WhatsApp', 'Configurações']) {
        await expect(nav.getByRole('link', { name })).toBeVisible()
      }
      await expect(nav.getByRole('link', { name: 'Convidados' })).toHaveAttribute('aria-current', 'page')
      await expect(page.getByRole('button', { name: 'Abrir menu' })).toBeHidden()

      const search = page.getByLabel('Buscar')
      await search.fill(SEED_PREFIX)
      await expect(page.getByText('Mostrando 1–20 de 25')).toBeVisible()

      // pointer cursors
      const nameHeader = page.getByRole('columnheader', { name: 'Nome' })
      expect(await cursorOf(nameHeader.getByRole('button'))).toBe('pointer')
      expect(await cursorOf(page.getByRole('button', { name: 'Adicionar convidado' }))).toBe('pointer')
      expect(
        await cursorOf(rowOf(page, `${SEED_PREFIX} 01`).getByRole('button', { name: 'Copiar link' })),
      ).toBe('pointer')
      const prev = page.getByRole('button', { name: 'Anterior' })
      await expect(prev).toBeDisabled()
      expect(await cursorOf(prev)).toBe('not-allowed')

      // sorting
      const firstRow = page.getByRole('row').nth(1)
      await expect(nameHeader).toHaveAttribute('aria-sort', 'ascending')
      await expect(firstRow).toContainText(`${SEED_PREFIX} 01`)
      await nameHeader.getByRole('button').click()
      await expect(nameHeader).toHaveAttribute('aria-sort', 'descending')
      await expect(firstRow).toContainText(`${SEED_PREFIX} 25`)
      await nameHeader.getByRole('button').click()
      await expect(nameHeader).toHaveAttribute('aria-sort', 'ascending')

      // pagination
      await page.getByRole('button', { name: 'Próxima' }).click()
      await expect(page.getByText('Mostrando 21–25 de 25')).toBeVisible()
      await expect(rowOf(page, `${SEED_PREFIX} 25`)).toBeVisible()
      await page.getByRole('button', { name: 'Anterior' }).click()
      await expect(page.getByText('Mostrando 1–20 de 25')).toBeVisible()

      // status filter
      await page
        .getByRole('group', { name: 'Resposta' })
        .getByRole('button', { name: 'Sim', exact: true })
        .click()
      await expect(page.getByText('Mostrando 1–3 de 3')).toBeVisible()
      const statuses = page.getByRole('row').filter({ hasText: SEED_PREFIX })
      await expect(statuses).toHaveCount(3)
      for (const row of await statuses.all()) await expect(row).toContainText('Sim')
      await page
        .getByRole('group', { name: 'Resposta' })
        .getByRole('button', { name: 'Todas', exact: true })
        .click()

      // new-guest sheet over the list keeps the search term
      const form = await openNewGuestSheet(page)
      await form.getByLabel('Nome').fill('Paginação Nova')
      await form.getByLabel('Nome').press('Enter')
      await expect(toast(page)).toContainText('Convidado adicionado.')
      await expect(form).toBeHidden()
      await expect(search).toHaveValue(SEED_PREFIX)
      await expect(page.getByText('Mostrando 1–20 de 26')).toBeVisible()
    })

    test('mobile: drawer navigation, stacked cards and no horizontal scroll', async ({ page }) => {
      await signIn(page)
      await page.goto('/admin/guests')
      await expect(page.getByRole('heading', { name: 'Convidados' })).toBeVisible()

      const row = rowOf(page, `${SEED_PREFIX} 01`)
      const cells = row.getByRole('cell')
      const first = await cells.nth(0).boundingBox()
      const second = await cells.nth(1).boundingBox()
      expect(second!.y).toBeGreaterThan(first!.y + first!.height - 1)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

      await page.getByRole('button', { name: 'Abrir menu' }).click()
      const drawer = page.getByRole('dialog', { name: 'Menu' })
      await drawer.getByRole('link', { name: 'Recados' }).click()
      await expect(page).toHaveURL(/\/admin\/messages$/)
      await expect(page.getByRole('heading', { name: 'Recados' })).toBeVisible()
      await expect(drawer).toBeHidden()
    })
  })
})
