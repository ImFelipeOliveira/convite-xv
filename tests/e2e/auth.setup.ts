// Signs the admin in once per run and stores the session cookie, so the admin specs don't each
// spend a login (sign-in is rate limited per IP and per e-mail). Only admin-login.spec signs in for real.
import { expect, test as setup } from '@playwright/test'
import { ADMIN_STORAGE_STATE, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD } from './fixtures'

setup.use({ extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.30' } })

setup('sign in as admin', async ({ page }) => {
  await page.goto('/admin/login')
  await page.getByLabel('E-mail').fill(E2E_ADMIN_EMAIL)
  await page.getByLabel('Senha', { exact: true }).fill(E2E_ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await expect(page).toHaveURL(/\/admin$/)
  await page.context().storageState({ path: ADMIN_STORAGE_STATE })
})
