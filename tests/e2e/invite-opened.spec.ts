import { expect, test } from '@playwright/test'
import { deleteGuestsByName, guestOpenedAt, insertGuestWithToken } from './db'

// own fake client IP: the invite route and the open action are rate-limited per IP
test.use({ extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.31' } })

const OWN_GUESTS = ['Abertura Navegador', 'Abertura Previa']

test.describe('invite "opened" tracking', () => {
  test.afterAll(async () => {
    await deleteGuestsByName(OWN_GUESTS)
  })

  test('a plain server fetch (link preview, curl) does not mark the invite opened', async ({ request }) => {
    const guest = await insertGuestWithToken('Abertura Previa', null)
    for (const ua of ['curl/8.7.1', 'axios/1.7.2', 'WhatsApp/2.23.20.0 A', 'Mozilla/5.0 (compatible; Preview)']) {
      const res = await request.get(`/c/${guest.token}`, { headers: { 'user-agent': ua } })
      expect(res.status(), ua).toBe(200)
      await res.text()
    }
    // give a (wrongly) async server-side mark time to land before asserting it never happened
    await new Promise((r) => setTimeout(r, 1000))
    expect(await guestOpenedAt(guest.id)).toBeNull()
  })

  test('opening the invite in a real browser marks it opened', async ({ page }) => {
    const guest = await insertGuestWithToken('Abertura Navegador', null)
    expect(await guestOpenedAt(guest.id)).toBeNull()
    await page.goto(`/c/${guest.token}`)
    await expect(page.getByRole('button', { name: 'Entrar sem animação' })).toBeVisible()
    await expect.poll(() => guestOpenedAt(guest.id), { timeout: 10_000 }).not.toBeNull()
  })
})
