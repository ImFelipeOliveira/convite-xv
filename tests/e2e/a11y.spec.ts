import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { resetE2eGuestRsvp } from './db'
import { ADMIN_STORAGE_STATE, E2E_GUEST_TOKEN } from './fixtures'

const invitePath = `/c/${E2E_GUEST_TOKEN}`

test.use({ viewport: { width: 390, height: 844 } })

test.beforeEach(() => resetE2eGuestRsvp())
test.afterEach(() => resetE2eGuestRsvp())

async function enterWithoutAnimation(page: Page) {
  await page.goto(invitePath)
  await page.getByRole('button', { name: 'Entrar sem animação' }).click()
  await expect(page.getByRole('heading', { name: 'Isabella' })).toBeVisible()
}

// axe samples colours mid-fade otherwise: wait for every finite animation to end first.
async function settleAnimations(page: Page) {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity),
  )
}

async function seriousViolations(page: Page, include?: string) {
  await settleAnimations(page)
  const builder = new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    // oversized "15" numerals are aria-hidden pure decoration (WCAG 1.4.3 exempts them) with intentionally faint ink
    .exclude('[data-testid="giant-numeral"]')
  if (include) builder.include(include)
  const { violations } = await builder.analyze()
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target.join(' ')) }))
}

test('opening screen has no serious accessibility violations', async ({ page }) => {
  await page.goto(invitePath)
  await expect(page.getByRole('button', { name: 'Abrir o convite' })).toBeVisible()
  expect(await seriousViolations(page)).toEqual([])
})

test('invite has no serious accessibility violations', async ({ page }) => {
  await enterWithoutAnimation(page)
  expect(await seriousViolations(page)).toEqual([])
})

test('RSVP section has no serious accessibility violations', async ({ page }) => {
  await enterWithoutAnimation(page)
  await page.locator('#rsvp').scrollIntoViewIfNeeded()
  expect(await seriousViolations(page, '#rsvp')).toEqual([])
})

test('admin login has no serious accessibility violations', async ({ page }) => {
  await page.goto('/admin/login')
  await expect(page.getByRole('heading', { name: 'Entrar no painel' })).toBeVisible()
  expect(await seriousViolations(page)).toEqual([])
})

test.describe('admin', () => {
  // signed in through the saved admin session (auth.setup.ts)
  test.use({ extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.15' }, storageState: ADMIN_STORAGE_STATE })

  test('panel pages have no serious accessibility violations', async ({ page }) => {
    await page.goto('/admin/guests') // full load: no hidden previous page in the DOM
    await expect(page.getByRole('heading', { name: 'Convidados' })).toBeVisible()
    expect(await seriousViolations(page)).toEqual([])

    // the guest sheet open over the list
    await page.getByRole('button', { name: 'Adicionar convidado' }).first().click()
    await expect(page.getByRole('form', { name: 'Novo convidado' })).toBeVisible()
    expect(await seriousViolations(page)).toEqual([])

    for (const [path, heading] of [
      ['/admin', 'Resumo'],
      ['/admin/gifts', 'Presentes'],
      ['/admin/settings', 'Configurações'],
    ]) {
      await page.goto(path)
      await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible()
      expect(await seriousViolations(page), path).toEqual([])
    }
  })
})

test('action buttons are at least 44px tall', async ({ page }) => {
  await page.goto(invitePath)
  for (const name of ['Abrir o convite', 'Entrar sem animação']) {
    const box = await page.getByRole('button', { name }).boundingBox()
    expect(box?.height, name).toBeGreaterThanOrEqual(44)
  }
  await page.getByRole('button', { name: 'Entrar sem animação' }).click()
  const section = page.locator('#rsvp')
  await section.scrollIntoViewIfNeeded()
  await section.getByText('Vou com certeza').click()
  await section.getByRole('button', { name: 'Adicionar acompanhante' }).click() // reveals "Remover"
  for (const name of ['Adicionar acompanhante', 'Remover acompanhante', 'Confirmar presença']) {
    const box = await section.getByRole('button', { name }).boundingBox()
    expect(box?.height, name).toBeGreaterThanOrEqual(44)
    expect(box?.width, name).toBeGreaterThanOrEqual(44)
  }
})

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('shows the invite right after opening, without waiting for animation', async ({ page }) => {
    await page.goto(invitePath)
    await page.getByRole('button', { name: 'Abrir o convite' }).click()
    await expect(page.getByRole('heading', { name: 'Isabella' })).toBeVisible({ timeout: 500 })
  })
})
