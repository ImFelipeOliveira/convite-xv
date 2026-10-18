import { expect, test, type Locator, type Page } from '@playwright/test'
import { deleteGuestsByName, seedGuests } from './db'
import { ADMIN_STORAGE_STATE, E2E_GUEST_NAME, E2E_GUEST_TOKEN } from './fixtures'

// sign-in is limited to 5 attempts per client IP: each admin spec uses its own fake IP
// signed in through the saved admin session (auth.setup.ts); the gate test opts out of it
test.use({ extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.22' }, storageState: ADMIN_STORAGE_STATE })

const CSV =
  '\uFEFFnome;telefone;limite_acompanhantes\nJoão Ávila;(95) 99123-4567;2\nMaria;;0\n\nPedro;123;1\n'
const OWN_GUESTS = ['Ana Teste', 'João Ávila', 'Maria', 'Pedro', 'Paginação Nova', 'Repetido Um', 'Repetido Dois', 'Repetido Três']
const SEED_PREFIX = 'Paginação'

const rowOf = (page: Page, name: string) => page.getByRole('row').filter({ hasText: name })
const toast = (page: Page) => page.getByRole('status', { name: 'Notificações' })
const cursorOf = (l: Locator) => l.evaluate((el) => getComputedStyle(el).cursor)

/** Visible and actually on top: the element hit at its center belongs to it (not covered by a modal). */
async function expectOnTop(l: Locator) {
  await expect(l).toBeVisible()
  const box = (await l.boundingBox())!
  const hit = await l.evaluate(
    (el, p) => {
      const top = document.elementFromPoint(p.x, p.y)
      return !!top && el.contains(top)
    },
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  )
  expect(hit, 'element is covered').toBe(true)
}
const toastCard = (page: Page, text: string) => toast(page).locator(':scope > div').filter({ hasText: text })

async function openNewGuestSheet(page: Page) {
  await page.getByRole('button', { name: 'Adicionar convidado' }).first().click()
  const form = page.getByRole('form', { name: 'Novo convidado' })
  await expect(form).toBeVisible()
  return form
}

test.describe('admin guests', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] })
  test.afterAll(() => deleteGuestsByName(OWN_GUESTS))

  test('guest list and export are gated without a session', async ({ playwright, baseURL }) => {
    const request = await playwright.request.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    })
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
    await page.goto('/admin/guests')
    await expect(page.getByRole('heading', { name: 'Convidados' })).toBeVisible()

    // create in a sheet over the list
    const form = await openNewGuestSheet(page)
    await expect(form.getByLabel('Nome')).toBeFocused()
    // accessible name is just the label (helper/error text are descriptions)
    await expect(form.getByRole('textbox', { name: 'Nome', exact: true })).toBeVisible()
    await form.getByLabel('Nome').fill('Ana Teste')

    // a save error inside the sheet: inline message + an error toast above the modal
    await form.getByLabel('Telefone').fill('123')
    await form.getByRole('button', { name: 'Salvar' }).click()
    await expect(form.getByLabel('Telefone')).toHaveAttribute('aria-invalid', 'true')
    const errorToast = toastCard(page, 'Revise os campos destacados.')
    await expectOnTop(errorToast)
    await errorToast.getByRole('button', { name: 'Fechar notificação' }).click()
    await expect(errorToast).toHaveCount(0)

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
    const wa = ana.getByRole('link', { name: 'Abrir no WhatsApp' })
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

    // import CSV in a sheet (phones: behind "Mais ações"); the report stays visible until closed
    await expect(page.getByRole('button', { name: 'Importar planilha' })).toBeHidden()
    await page.getByRole('button', { name: 'Mais ações' }).click()
    const more = page.getByRole('dialog', { name: 'Mais ações' })
    await expect(more.getByRole('link', { name: 'Exportar CSV' })).toHaveAttribute('href', '/admin/guests/export')
    await more.getByRole('button', { name: 'Importar planilha' }).click()
    await expect(more).toBeHidden()
    const importForm = page.getByRole('form', { name: 'Importar convidados' })
    await importForm.getByLabel('Arquivo CSV').setInputFiles({
      name: 'convidados.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(CSV, 'utf-8'),
    })
    await importForm.getByRole('button', { name: 'Importar' }).click()
    await expect(page.getByText('2 importados, 1 erro (linha 5: Telefone inválido)')).toBeVisible()
    // the sheet stays open (line errors): the toast must still be on top of it
    await expectOnTop(toastCard(page, '2 convidados importados'))
    await page
      .getByRole('dialog', { name: 'Importar planilha' })
      .getByRole('button', { name: 'Fechar', exact: true })
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
    await expect(page.getByLabel('Buscar')).toBeFocused()
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

    // status filter chips (phones: in a bottom sheet behind "Filtros", with the active count)
    await expect(page.getByRole('group', { name: 'Resposta' })).toBeHidden()
    await page.getByRole('button', { name: 'Filtros', exact: true }).click()
    const sheet = page.getByRole('dialog', { name: 'Filtros' })
    await sheet.getByRole('group', { name: 'Resposta' }).getByRole('button', { name: 'Sim', exact: true }).click()
    await sheet.getByRole('button', { name: /^Ver resultados/ }).click()
    await expect(sheet).toBeHidden()
    await expect(rowOf(page, 'Ana Teste')).toHaveCount(0)
    const filtersButton = page.getByRole('button', { name: 'Filtros · 1' })
    await expect(filtersButton).toBeFocused()
    await filtersButton.click()
    await sheet.getByRole('button', { name: 'Limpar filtros' }).click()
    await sheet.getByRole('button', { name: /^Ver resultados/ }).click()
    await expect(rowOf(page, 'Ana Teste')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Filtros', exact: true })).toBeVisible()

    // export
    const res = await page.request.get('/admin/guests/export', { maxRedirects: 0 })
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toBe('text/csv; charset=utf-8')
    expect(res.headers()['content-disposition']).toContain('convidados.csv')
    const csv = await res.text()
    expect(csv).toContain('nome;telefone;limite_acompanhantes;resposta')
    expect(csv).toContain('Ana Teste;(95) 98888-7777;3;Pendente')
  })

  test('a repeated phone asks before saving, is flagged in the list and filtered under Alertas', async ({
    page,
  }) => {
    const PHONE = '(95) 93333-2222'
    await page.goto('/admin/guests')

    let form = await openNewGuestSheet(page)
    await form.getByLabel('Nome').fill('Repetido Um')
    await form.getByLabel('Telefone').fill(PHONE)
    await form.getByRole('button', { name: 'Salvar' }).click()
    await expect(toast(page)).toContainText('Convidado adicionado.')
    await expect(form).toBeHidden()

    // same phone in another format: warned, nothing saved yet
    form = await openNewGuestSheet(page)
    await form.getByLabel('Nome').fill('Repetido Dois')
    await form.getByLabel('Telefone').fill('95933332222')
    await form.getByRole('button', { name: 'Salvar', exact: true }).click()
    const warning = form.getByText('Este telefone já está cadastrado para Repetido Um.')
    await expect(warning).toBeVisible()
    await expect(rowOf(page, 'Repetido Dois')).toHaveCount(0)

    // "Corrigir telefone" puts the cursor back in the field and dismisses the warning
    await form.getByRole('button', { name: 'Corrigir telefone' }).click()
    await expect(form.getByLabel('Telefone')).toBeFocused()
    await expect(warning).toBeHidden()

    // Enter in a field is plain "Salvar": warned again, then confirmed
    await form.getByLabel('Nome').press('Enter')
    await expect(warning).toBeVisible()
    await form.getByRole('button', { name: 'Salvar mesmo assim' }).click()
    await expect(toast(page)).toContainText('Convidado adicionado.')
    await expect(form).toBeHidden()

    // the other guest's name is in each row (badge description): match the row by its first cell
    const ownRow = (name: string) => page.getByRole('row').filter({ hasText: new RegExp(`^${name}`) })
    for (const [name, other] of [
      ['Repetido Um', 'Repetido Dois', 'Repetido Três'],
      ['Repetido Dois', 'Repetido Um'],
    ]) {
      await expect(ownRow(name).getByText('Telefone repetido')).toBeVisible()
      await expect(ownRow(name)).toContainText(`Mesmo telefone de ${other}`)
    }
    await expect(rowOf(page, 'Ana Teste').getByText('Telefone repetido')).toHaveCount(0)

    // the first WhatsApp send asks like "Reenviar" does
    const sendButton = ownRow('Repetido Dois').getByRole('button', { name: 'Enviar convite para Repetido Dois' })
    await sendButton.click()
    const confirm = page.getByRole('group', { name: 'Confirmar envio para Repetido Dois' })
    await expect(confirm).toContainText('Este número também é de Repetido Um. Enviar mesmo assim?')
    await confirm.getByRole('button', { name: 'Cancelar' }).click()
    await expect(confirm).toHaveCount(0)
    await expect(sendButton).toBeFocused()

    // "Alertas" filter (phones: in the Filtros sheet) isolates them
    await page.getByRole('button', { name: 'Filtros', exact: true }).click()
    const sheet = page.getByRole('dialog', { name: 'Filtros' })
    await sheet
      .getByRole('group', { name: 'Alertas' })
      .getByRole('button', { name: /^Telefone repetido/ })
      .click()
    await sheet.getByRole('button', { name: /^Ver resultados/ }).click()
    await expect(sheet).toBeHidden()
    await expect(page.getByRole('row').filter({ hasText: 'Repetido' })).toHaveCount(2)
    await expect(rowOf(page, E2E_GUEST_NAME)).toHaveCount(0)
    await expect(rowOf(page, 'Ana Teste')).toHaveCount(0)

    // CSV import: a repeated phone is imported anyway and reported as a warning (not an error)
    await page.getByRole('button', { name: 'Mais ações' }).click()
    await page.getByRole('dialog', { name: 'Mais ações' }).getByRole('button', { name: 'Importar planilha' }).click()
    const importForm = page.getByRole('form', { name: 'Importar convidados' })
    await importForm.getByLabel('Arquivo CSV').setInputFiles({
      name: 'repetidos.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(`nome;telefone\nRepetido Três;${PHONE}\n`, 'utf-8'),
    })
    await importForm.getByRole('button', { name: 'Importar' }).click()
    await expect(importForm.getByText('1 importado', { exact: true })).toBeVisible()
    await expect(
      importForm.getByRole('list', { name: 'Avisos' }).getByText('Linha 2: telefone repetido (Repetido Dois e Repetido Um)'),
    ).toBeVisible()
    await page
      .getByRole('dialog', { name: 'Importar planilha' })
      .getByRole('button', { name: 'Fechar', exact: true })
      .click()
    await expect(page.getByRole('row').filter({ hasText: 'Repetido' })).toHaveCount(3)
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

      // the sidebar spans the page: at the bottom of a long list it still fills the viewport
      await page.getByLabel('Buscar').fill('')
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      const sidebar = page.getByRole('complementary')
      const sideBox = await sidebar.evaluate((el) => {
        const r = el.getBoundingClientRect()
        return {
          top: r.top,
          bottom: r.bottom,
          vh: window.innerHeight,
          bg: getComputedStyle(el).backgroundColor,
        }
      })
      expect(sideBox.top).toBeLessThanOrEqual(0)
      expect(sideBox.bottom).toBeGreaterThanOrEqual(sideBox.vh)
      expect(sideBox.bg).toBe('rgb(247, 222, 219)')
      await expect(nav.getByRole('link', { name: 'Convidados' })).toBeInViewport()
      await page.evaluate(() => window.scrollTo(0, 0))
      await search.fill(SEED_PREFIX)

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
      await page.goto('/admin/guests')
      await expect(page.getByRole('heading', { name: 'Convidados' })).toBeVisible()

      // the first guest card starts above the fold (header actions and filters are collapsed)
      const firstCard = page.getByRole('row').nth(1)
      const firstBox = (await firstCard.boundingBox())!
      expect(firstBox.y + firstBox.height, 'first card not fully above the fold').toBeLessThanOrEqual(844)

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
