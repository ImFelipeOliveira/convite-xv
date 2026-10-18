import { readFileSync } from 'node:fs'
import { expect, test, type APIRequest, type Page, type Route } from '@playwright/test'
import { SignJWT } from 'jose'
import { deleteGuestsByName, insertGuest } from './db'
import { ADMIN_STORAGE_STATE } from './fixtures'

// version skew (a tab from the previous deploy) and sliding session renewal
test.use({ extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.41' }, storageState: ADMIN_STORAGE_STATE })

const EDITED = 'Skew Edição'
const RENAMED = 'Skew Rascunho Salvo'
const DELETING = 'Skew Exclusão'
const toast = (page: Page) => page.getByRole('status', { name: 'Notificações' })
const rowOf = (page: Page, name: string) => page.getByRole('row').filter({ hasText: name })

/** What Next answers for a Server Action id this deployment doesn't know (action-handler.js). */
async function answerAsUnknownAction(route: Route) {
  const req = route.request()
  if (req.method() !== 'POST' || !req.headers()['next-action']) return route.fallback()
  return route.fulfill({
    status: 409,
    headers: { 'x-nextjs-action-not-found': '1', 'content-type': 'text/plain' },
    body: 'Server Action unavailable.',
  })
}

test.describe('admin version skew', () => {
  test.afterAll(() => deleteGuestsByName([EDITED, RENAMED, DELETING]))

  test('a stale save reloads the panel and brings the draft back in the reopened sheet', async ({ page }) => {
    await insertGuest(EDITED, null)
    await page.goto('/admin/guests')
    await rowOf(page, EDITED).getByRole('button', { name: `Editar ${EDITED}` }).click()
    const form = page.getByRole('form', { name: 'Editar convidado' })
    await expect(form).toBeVisible()
    await form.getByLabel('Nome').fill(RENAMED)
    await form.getByLabel('Limite de acompanhantes').fill('4')

    await page.route('**/admin/guests', answerAsUnknownAction)
    const reloaded = page.waitForEvent('load')
    await form.getByRole('button', { name: 'Salvar' }).click()
    await expect(toast(page)).toContainText('O painel foi atualizado. Recarregando…')
    // the "new deployment" answers normally after the reload
    await page.unroute('**/admin/guests', answerAsUnknownAction)
    await reloaded

    const restored = page.getByRole('form', { name: 'Editar convidado' })
    await expect(restored).toBeVisible()
    await expect(restored.getByLabel('Nome')).toHaveValue(RENAMED)
    await expect(restored.getByLabel('Limite de acompanhantes')).toHaveValue('4')
    await expect(toast(page)).toContainText('Rascunho recuperado')
    // restored once: the draft is gone from storage
    expect(await page.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith('xv:draft:')))).toEqual([])

    await restored.getByRole('button', { name: 'Salvar' }).click()
    await expect(restored).toBeHidden()
    await expect(rowOf(page, RENAMED)).toBeVisible()
  })

  test('a stale direct action call (delete) reloads instead of crashing', async ({ page }) => {
    await insertGuest(DELETING, null)
    await page.goto('/admin/guests')
    await rowOf(page, DELETING).getByRole('button', { name: `Excluir ${DELETING}` }).click()
    const dialog = page.getByRole('dialog', { name: 'Excluir convidado?' })

    await page.route('**/admin/guests', answerAsUnknownAction)
    const reloaded = page.waitForEvent('load')
    await dialog.getByRole('button', { name: 'Excluir' }).click()
    await expect(toast(page)).toContainText('O painel foi atualizado. Recarregando…')
    await page.unroute('**/admin/guests', answerAsUnknownAction)
    await reloaded
    // nothing was deleted and the panel is usable again
    await expect(rowOf(page, DELETING)).toBeVisible()
    await expect(page.getByRole('dialog', { name: 'Excluir convidado?' })).toBeHidden()
  })
})

test.describe('sliding admin session', () => {
  const DAY = 24 * 60 * 60

  function savedAdminId(): string {
    const state = JSON.parse(readFileSync(ADMIN_STORAGE_STATE, 'utf8')) as { cookies: { name: string; value: string }[] }
    const jwt = state.cookies.find((c) => c.name === 'xv_admin')!.value
    return (JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()) as { sub: string }).sub
  }

  async function sessionToken(issuedAt: number) {
    return new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(savedAdminId())
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + 30 * DAY)
      .sign(new TextEncoder().encode(process.env.AUTH_SECRET!.trim()))
  }

  async function adminGet(api: APIRequest, baseURL: string, token: string) {
    const request = await api.newContext({ baseURL, storageState: { cookies: [], origins: [] } })
    const res = await request.get('/admin/guests', { maxRedirects: 0, headers: { cookie: `xv_admin=${token}` } })
    const setCookie = res.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie').map((h) => h.value)
    await request.dispose()
    return { status: res.status(), setCookie }
  }

  test('a valid cookie older than 24 h is re-issued for 30 more days', async ({ playwright, baseURL }) => {
    const now = Math.floor(Date.now() / 1000)
    const old = await sessionToken(now - 2 * DAY)
    const { status, setCookie } = await adminGet(playwright.request, baseURL!, old)
    expect(status).toBe(200)
    const renewed = setCookie.find((c) => c.startsWith('xv_admin='))
    expect(renewed, 'renewed session cookie').toBeDefined()
    expect(renewed).toMatch(/Max-Age=2592000/i)
    expect(renewed).toMatch(/HttpOnly/i)
    expect(renewed).toMatch(/SameSite=lax/i)
    expect(renewed).toMatch(/Path=\//i)
    const value = renewed!.split(';')[0].slice('xv_admin='.length)
    expect(value).not.toBe(old)
    const iat = (JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString()) as { iat: number }).iat
    expect(iat).toBeGreaterThanOrEqual(now)
  })

  test('a fresh cookie is left alone and an expired one still goes to login', async ({ playwright, baseURL }) => {
    const now = Math.floor(Date.now() / 1000)
    const fresh = await adminGet(playwright.request, baseURL!, await sessionToken(now - 60))
    expect(fresh.status).toBe(200)
    expect(fresh.setCookie.some((c) => c.startsWith('xv_admin='))).toBe(false)

    const expired = await adminGet(playwright.request, baseURL!, await sessionToken(now - 31 * DAY))
    expect(expired.status).toBe(307)
    expect(expired.setCookie.some((c) => c.startsWith('xv_admin='))).toBe(false)
  })
})
