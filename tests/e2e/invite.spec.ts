import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { E2E_GUEST_TOKEN } from './fixtures'

const invitePath = `/c/${E2E_GUEST_TOKEN}`

test.use({ viewport: { width: 390, height: 844 } })

test.beforeEach(async ({ page }) => {
  await page.goto(invitePath)
  await page.getByRole('button', { name: 'Entrar sem animação' }).click()
})

test('shows the day, the venue and the dress code', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Sítio Lua Azul.' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Google Maps' })).toHaveAttribute('href', /2\.8350401/)
  await expect(page.getByText('Traje de banho é indispensável.')).toBeVisible()
})

test('adds the event to the calendar as an .ics file', async ({ page }) => {
  const link = page.getByRole('link', { name: 'Adicionar à agenda' })
  await expect(link).toHaveAttribute('href', `/c/${E2E_GUEST_TOKEN}/calendar.ics`)

  const downloadPromise = page.waitForEvent('download')
  await link.click()
  const download = await downloadPromise

  expect(download.suggestedFilename()).toMatch(/\.ics$/)
  const body = await readFile(await download.path(), 'utf8')
  expect(body).toContain('BEGIN:VCALENDAR')
})

test('closing shows the RSVP, venue, gifts and Pix shortcuts (flags on in e2e)', async ({ page }) => {
  // playwright.config.ts runs the server with FEATURES=gifts,pix; flags off is covered by the Closing unit test
  const shortcuts = page.getByRole('navigation', { name: 'Atalhos do convite' })
  await expect(shortcuts.getByRole('link', { name: 'Presença' })).toBeVisible()
  await expect(shortcuts.getByRole('link', { name: 'Local' })).toBeVisible()
  await expect(shortcuts.getByRole('link', { name: 'Presentes' })).toHaveAttribute('href', '#gifts')
  await expect(shortcuts.getByRole('link', { name: 'Pix' })).toHaveAttribute('href', '#pix')
})

test('hero CTA anchors to the RSVP section', async ({ page }) => {
  await expect(page.getByRole('link', { name: 'Confirmar presença' })).toHaveAttribute('href', '#rsvp')
  await expect(page.getByRole('link', { name: 'O dia', exact: true })).toHaveAttribute('href', '#the-day')
  await expect(page.locator('#rsvp')).toHaveCount(1)
})
