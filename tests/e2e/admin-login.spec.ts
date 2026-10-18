import { expect, test } from '@playwright/test'
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD } from './fixtures'

// sign-in is limited to 5 attempts per client IP: each admin spec uses its own fake IP
test.use({ extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.21' } })

test('redirects /admin to the login page without a session', async ({ page }) => {
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/admin\/login$/)
})

test('wrong credentials show a generic error', async ({ page }) => {
  await page.goto('/admin/login')
  await page.getByLabel('E-mail').fill(E2E_ADMIN_EMAIL)
  await page.getByLabel('Senha').fill('errada')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByText('E-mail ou senha incorretos.')).toBeVisible()
})

test('signs in and out', async ({ page }) => {
  await page.goto('/admin/login')
  await page.getByLabel('E-mail').fill(E2E_ADMIN_EMAIL.toUpperCase())
  await page.getByLabel('Senha').fill(E2E_ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).toHaveURL(/\/admin$/)
  await expect(page.getByRole('heading', { name: 'Painel' })).toBeVisible()
  await page.getByRole('button', { name: 'Sair' }).click()
  await expect(page).toHaveURL(/\/admin\/login$/)
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/admin\/login$/)
})

test('GET /admin is gated at the proxy', async ({ page, request }) => {
  const anon = await request.get('/admin', { maxRedirects: 0 })
  expect(anon.status()).toBe(307)
  expect(anon.headers()['location']).toMatch(/\/admin\/login$/)
  expect(await anon.text()).not.toContain('Painel')

  await page.goto('/admin/login')
  await page.getByLabel('E-mail').fill(E2E_ADMIN_EMAIL)
  await page.getByLabel('Senha').fill(E2E_ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).toHaveURL(/\/admin$/)
  const authed = await page.request.get('/admin', { maxRedirects: 0 })
  expect(authed.status()).toBe(200)
  await page.goto('/admin/login')
  await expect(page).toHaveURL(/\/admin$/)
})

test('sends security headers', async ({ request }) => {
  const admin = await request.get('/admin/login')
  const h = admin.headers()
  expect(h['x-content-type-options']).toBe('nosniff')
  expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin')
  expect(h['x-frame-options']).toBe('DENY')
  expect(h['content-security-policy']).toBe("frame-ancestors 'none'")
  const home = await request.get('/')
  expect(home.headers()['x-content-type-options']).toBe('nosniff')
  expect(home.headers()['x-frame-options']).toBeUndefined()
})
