import { expect, test } from '@playwright/test'
import { E2E_GUEST_TOKEN } from './fixtures'

const invitePath = `/c/${E2E_GUEST_TOKEN}`

test.use({ viewport: { width: 390, height: 844 } })

test('shows the seal and opens on tap', async ({ page }) => {
  await page.goto(invitePath)
  const seal = page.getByRole('button', { name: 'Abrir o convite' })
  await expect(seal).toBeVisible()

  await seal.click()

  await expect(page.getByRole('heading', { name: 'Isabella' })).toBeVisible({ timeout: 3000 })
  await expect(seal).toBeHidden({ timeout: 3000 })
})

test('enter without animation', async ({ page }) => {
  await page.goto(invitePath)

  await page.getByRole('button', { name: 'Entrar sem animação' }).click()

  await expect(page.getByRole('heading', { name: 'Isabella' })).toBeVisible({ timeout: 500 })
  await expect(page.getByRole('button', { name: 'Abrir o convite' })).toBeHidden({ timeout: 500 })
})

test('second visit skips the doors', async ({ page }) => {
  await page.goto(invitePath)
  await page.getByRole('button', { name: 'Abrir o convite' }).click()
  await expect(page.getByRole('heading', { name: 'Isabella' })).toBeVisible({ timeout: 3000 })

  await page.reload()

  await expect(page.getByRole('heading', { name: 'Isabella' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Abrir o convite' })).toBeHidden()
})

test('unknown token returns 404', async ({ page }) => {
  const response = await page.goto('/c/zzzzzzzzzzzzzzzzzzzzzz')

  expect(response?.status()).toBe(404)
  await expect(page.getByText('Convite não encontrado.')).toBeVisible()
})

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('opens with a short crossfade', async ({ page }) => {
    await page.goto(invitePath)

    await page.getByRole('button', { name: 'Abrir o convite' }).click()

    await expect(page.getByRole('heading', { name: 'Isabella' })).toBeVisible({ timeout: 1000 })
    await expect(page.getByRole('button', { name: 'Abrir o convite' })).toBeHidden({ timeout: 1000 })
  })
})
