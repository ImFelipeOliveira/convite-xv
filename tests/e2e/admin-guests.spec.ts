import { expect, test, type Page } from '@playwright/test'
import { deleteGuestsByName } from './db'
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_GUEST_NAME, E2E_GUEST_TOKEN } from './fixtures'

const CSV =
  '\uFEFFnome;telefone;limite_acompanhantes\nJoão Ávila;(95) 99123-4567;2\nMaria;;0\n\nPedro;123;1\n'
const OWN_GUESTS = ['Ana Teste', 'João Ávila', 'Maria', 'Pedro']

async function signIn(page: Page) {
  await page.goto('/admin/login')
  await page.getByLabel('E-mail').fill(E2E_ADMIN_EMAIL)
  await page.getByLabel('Senha').fill(E2E_ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).toHaveURL(/\/admin$/)
}

const rowOf = (page: Page, name: string) => page.getByRole('row').filter({ hasText: name })

test.describe('admin guests', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] })
  test.afterAll(() => deleteGuestsByName(OWN_GUESTS))

  test('guest list and export are gated without a session', async ({ request }) => {
    for (const path of ['/admin/guests', '/admin/guests/export']) {
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

    // create
    const form = page.getByRole('form', { name: 'Novo convidado' })
    await form.getByLabel('Nome').fill('Ana Teste')
    await form.getByLabel('Telefone').fill('(95) 98888-7777')
    await form.getByLabel('Limite de acompanhantes').fill('1')
    await form.getByRole('button', { name: 'Adicionar convidado' }).click()
    await expect(page.getByText('Convidado adicionado.')).toBeVisible()
    const ana = rowOf(page, 'Ana Teste')
    await expect(ana).toBeVisible()
    await expect(ana).toContainText('(95) 98888-7777')

    // copy invite link
    await ana.getByRole('button', { name: 'Copiar link' }).click()
    await expect(ana.getByText('Link copiado')).toBeVisible()
    const copied = await page.evaluate(() => navigator.clipboard.readText())
    expect(copied).toMatch(/^http:\/\/localhost:\d+\/c\/[0-9A-Za-z]{22}$/)

    // WhatsApp link opens in a new tab with the guest's number
    const wa = ana.getByRole('link', { name: 'Enviar pelo WhatsApp' })
    await expect(wa).toHaveAttribute('target', '_blank')
    await expect(wa).toHaveAttribute('href', /^https:\/\/wa\.me\/5595988887777\?text=/)

    // edit
    await ana.getByRole('link', { name: 'Editar' }).click()
    await expect(page).toHaveURL(/\/admin\/guests\/[0-9a-f-]{36}$/)
    // getByRole skips hidden nodes: the list route may stay mounted (hidden) after client navigation
    const editForm = page.getByRole('form', { name: 'Editar convidado' })
    await editForm.getByLabel('Limite de acompanhantes').fill('3')
    await editForm.getByRole('button', { name: 'Salvar' }).click()
    await expect(page).toHaveURL(/\/admin\/guests$/)
    await expect(rowOf(page, 'Ana Teste').getByRole('cell').nth(2)).toHaveText('3')

    // import CSV
    await page.getByLabel('Arquivo CSV').setInputFiles({
      name: 'convidados.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(CSV, 'utf-8'),
    })
    await page.getByRole('button', { name: 'Importar' }).click()
    await expect(page.getByText('2 importados, 1 erro (linha 5: Telefone inválido)')).toBeVisible()
    await expect(rowOf(page, 'João Ávila')).toBeVisible()
    await expect(rowOf(page, 'Maria')).toBeVisible()
    await expect(rowOf(page, 'Pedro')).toHaveCount(0)

    // delete with inline confirmation
    const maria = rowOf(page, 'Maria')
    await maria.getByRole('button', { name: 'Excluir' }).click()
    await maria.getByRole('button', { name: 'Confirmar exclusão' }).click()
    await expect(rowOf(page, 'Maria')).toHaveCount(0)
    await expect(rowOf(page, E2E_GUEST_NAME)).toBeVisible()

    // search and filter
    await page.getByLabel('Buscar').fill('Ana')
    await page.getByRole('button', { name: 'Filtrar' }).click()
    await expect(rowOf(page, 'Ana Teste')).toBeVisible()
    await expect(rowOf(page, 'João Ávila')).toHaveCount(0)
    await page.getByLabel('Buscar').fill('')
    await page.getByLabel('Resposta').selectOption('yes')
    await page.getByRole('button', { name: 'Filtrar' }).click()
    await expect(rowOf(page, 'Ana Teste')).toHaveCount(0)

    // export
    const res = await page.request.get('/admin/guests/export', { maxRedirects: 0 })
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toBe('text/csv; charset=utf-8')
    expect(res.headers()['content-disposition']).toContain('guests.csv')
    const csv = await res.text()
    expect(csv).toContain('nome;telefone;limite_acompanhantes;resposta')
    expect(csv).toContain('Ana Teste;(95) 98888-7777;3;Pendente')
  })
})
