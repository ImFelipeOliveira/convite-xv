import { expect, test } from '@playwright/test'
import { E2E_GUEST_TOKEN } from './fixtures'

test.use({ viewport: { width: 390, height: 844 } })

test('every giant decorative numeral reads 15', async ({ page }) => {
  await page.goto(`/c/${E2E_GUEST_TOKEN}`)
  await page.getByRole('button', { name: 'Entrar sem animação' }).click()

  // hero and closing numerals (the door numeral unmounts with the opening)
  const numerals = page.getByTestId('giant-numeral')
  await expect(numerals).toHaveCount(2)
  for (const numeral of await numerals.all()) {
    await expect(numeral).toHaveText('15')
  }
})

test('the door numeral reads 15 before the opening', async ({ page }) => {
  await page.goto(`/c/${E2E_GUEST_TOKEN}`)
  const numerals = page.getByTestId('giant-numeral')
  await expect(numerals.first()).toHaveText('15')
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/open2.png` })
})
