import { expect, test } from '@playwright/test'
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, E2E_GUEST_TOKEN } from './fixtures'

// sign-in is limited to 5 attempts per client IP: each admin spec uses its own fake IP
test.use({ extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.21' } })

test('redirects /admin to the login page without a session', async ({ page }) => {
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/admin\/login$/)
})

test('password field has a show/hide toggle that keeps focus and does not submit', async ({ page }) => {
  await page.goto('/admin/login')
  const password = page.getByLabel('Senha', { exact: true })
  await password.fill('segredo')
  await expect(password).toHaveAttribute('type', 'password')
  const show = page.getByRole('button', { name: 'Mostrar senha' })
  await expect(show).toHaveAttribute('aria-pressed', 'false')
  expect(await show.evaluate((el) => getComputedStyle(el).cursor)).toBe('pointer')
  await password.focus()
  await show.click()
  await expect(password).toHaveAttribute('type', 'text')
  await expect(password).toBeFocused()
  const hide = page.getByRole('button', { name: 'Ocultar senha' })
  await expect(hide).toHaveAttribute('aria-pressed', 'true')
  await hide.click()
  await expect(password).toHaveAttribute('type', 'password')
  await expect(password).toHaveValue('segredo')
  await expect(page).toHaveURL(/\/admin\/login$/)
  await expect(page.getByText('E-mail ou senha incorretos.')).toHaveCount(0)
})

test('wrong credentials show a generic error', async ({ page }) => {
  await page.goto('/admin/login')
  await page.getByLabel('E-mail').fill(E2E_ADMIN_EMAIL)
  await page.getByLabel('Senha', { exact: true }).fill('errada')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page.getByText('E-mail ou senha incorretos.')).toBeVisible()
})

test('signs in and out', async ({ page }) => {
  await page.goto('/admin/login')
  await page.getByLabel('E-mail').fill(E2E_ADMIN_EMAIL.toUpperCase())
  await page.getByLabel('Senha', { exact: true }).fill(E2E_ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).toHaveURL(/\/admin$/)
  await expect(page.getByRole('heading', { name: 'Resumo' })).toBeVisible()
  // 390px viewport: "Sair" lives in the navigation drawer
  await page.getByRole('button', { name: 'Abrir menu' }).click()
  await page.getByRole('dialog', { name: 'Menu' }).getByRole('button', { name: 'Sair' }).click()
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
  await page.getByLabel('Senha', { exact: true }).fill(E2E_ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).toHaveURL(/\/admin$/)
  const authed = await page.request.get('/admin', { maxRedirects: 0 })
  expect(authed.status()).toBe(200)
  await page.goto('/admin/login')
  await expect(page).toHaveURL(/\/admin$/)
})

test('sends security headers', async ({ request }) => {
  const CSP = "frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  const admin = await request.get('/admin/login')
  const h = admin.headers()
  expect(h['x-content-type-options']).toBe('nosniff')
  expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin')
  expect(h['x-frame-options']).toBe('DENY')
  expect(h['content-security-policy']).toBe(CSP)
  expect(h['x-powered-by']).toBeUndefined()
  // production-only, and only when APP_URL is https: never on the http://localhost e2e server
  expect(h['strict-transport-security']).toBeUndefined()

  const home = await request.get('/')
  expect(home.headers()['x-content-type-options']).toBe('nosniff')
  expect(home.headers()['x-frame-options']).toBe('DENY')
  expect(home.headers()['content-security-policy']).toBe(CSP)
  expect(home.headers()['permissions-policy']).toContain('camera=()')

  // the invite URL carries the token: no referrer at all, and it can't be framed either
  const invite = await request.get(`/c/${E2E_GUEST_TOKEN}`)
  expect(invite.status()).toBe(200)
  expect(invite.headers()['referrer-policy']).toBe('no-referrer')
  expect(invite.headers()['x-frame-options']).toBe('DENY')
  expect(invite.headers()['content-security-policy']).toBe(CSP)
  expect(invite.headers()['permissions-policy']).toContain('geolocation=()')
  expect(invite.headers()['x-powered-by']).toBeUndefined()
})
