import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { deleteGiftsByName, deleteGuestsByName, insertGuestWithFixedToken, reserveGiftForE2eGuest, resetE2eGuestRsvp, seedGifts, setE2eGuestRsvp } from './db'
import { E2E_GUEST_TOKEN } from './fixtures'

// The invite's gift list (prancha 08). The webServer runs with FEATURES=gifts,pix (playwright.config.ts).
const OTHER_GUEST = 'Convidado Presentes Dois'
const OTHER_TOKEN = 'TesteE2EPresentes00002'
const STORE_URL = 'https://loja.example.com/perfume-floral'

const PERFUME = 'E2E Perfume floral'
const SKINCARE = 'E2E Kit de skincare'
const BAG = 'E2E Bolsa de festa'
const HEADPHONES = 'E2E Fone sem fio'
const NAMES = [PERFUME, SKINCARE, BAG, HEADPHONES]

// its own client IP, so the per-IP rate limits never collide with other specs
test.use({ viewport: { width: 390, height: 844 }, extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.30' } })

test.beforeEach(async () => {
  await seedGifts([
    { name: PERFUME, category: 'Beleza', purchaseUrl: STORE_URL },
    { name: SKINCARE, category: 'Beleza', imageUrl: 'https://127.0.0.1:9/quebrada.jpg' },
    { name: BAG, category: 'Moda' },
    { name: HEADPHONES, category: 'Tecnologia', priceCents: 25000 },
  ])
  await insertGuestWithFixedToken(OTHER_GUEST, OTHER_TOKEN)
})

test.afterEach(async () => {
  await resetE2eGuestRsvp()
  await deleteGiftsByName(NAMES)
  await deleteGuestsByName([OTHER_GUEST])
})

async function openGifts(page: Page, token = E2E_GUEST_TOKEN) {
  await page.goto(`/c/${token}`)
  await page.getByRole('button', { name: 'Entrar sem animação' }).click()
  const section = page.locator('#gifts')
  await section.scrollIntoViewIfNeeded()
  await expect(section.getByRole('heading', { name: 'Presentes, se quiser.' })).toBeVisible()
  return section
}

function tag(page: Page, name: string) {
  return page.locator('#gifts li').filter({ hasText: name })
}

test('reserves a gift after the server confirms, then undoes it', async ({ page }) => {
  const section = await openGifts(page)
  await section.getByRole('button', { name: `Reservar ${PERFUME}` }).click()

  const sheet = page.getByRole('dialog', { name: PERFUME })
  await expect(sheet.getByText('RESERVAR PRESENTE')).toBeVisible()
  await expect(sheet.getByText('RESERVANDO COMO')).toBeVisible()
  await expect(sheet.getByText('Convidado', { exact: true })).toBeVisible()
  await expect(
    sheet.getByText(
      'A reserva só indica que você vai levar este presente. Nenhuma cobrança é feita, e você pode desfazer depois.',
    ),
  ).toBeVisible()
  await sheet.getByRole('button', { name: 'Confirmar reserva' }).click()

  await expect(sheet).toBeHidden()
  await expect(section.getByRole('status')).toHaveText(`${PERFUME} reservado. Obrigada!`)
  await expect(tag(page, PERFUME).getByText('Reservado por você')).toBeVisible()

  await section.getByRole('button', { name: `Desfazer reserva de ${PERFUME}` }).click()
  await expect(section.getByRole('status')).toHaveText(`Reserva desfeita. ${PERFUME} voltou para a lista.`)
  await expect(section.getByRole('button', { name: `Reservar ${PERFUME}` })).toBeVisible()
})

test('"Voltar" closes the sheet without reserving', async ({ page }) => {
  const section = await openGifts(page)
  await section.getByRole('button', { name: `Reservar ${BAG}` }).click()
  const sheet = page.getByRole('dialog', { name: BAG })
  await sheet.getByRole('button', { name: 'Voltar' }).click()
  await expect(sheet).toBeHidden()
  await expect(section.getByRole('button', { name: `Reservar ${BAG}` })).toBeVisible()
})

test('tells the guest when someone else reserved first', async ({ page, browser }) => {
  const section = await openGifts(page)
  await section.getByRole('button', { name: `Reservar ${PERFUME}` }).click()
  const sheet = page.getByRole('dialog', { name: PERFUME })
  await expect(sheet.getByRole('button', { name: 'Confirmar reserva' })).toBeVisible()

  // another guest, in another browser, reserves the same gift meanwhile
  const other = await browser.newContext({
    viewport: { width: 390, height: 844 },
    extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.31' },
  })
  try {
    const otherPage = await other.newPage()
    const otherSection = await openGifts(otherPage, OTHER_TOKEN)
    await otherSection.getByRole('button', { name: `Reservar ${PERFUME}` }).click()
    await otherPage.getByRole('dialog', { name: PERFUME }).getByRole('button', { name: 'Confirmar reserva' }).click()
    await expect(tag(otherPage, PERFUME).getByText('Reservado por você')).toBeVisible()
  } finally {
    await other.close()
  }

  await sheet.getByRole('button', { name: 'Confirmar reserva' }).click()
  const conflict = page.getByRole('dialog', { name: 'Alguém foi mais rápido.' })
  await expect(conflict).toBeVisible()
  await expect(
    conflict.getByText(`${PERFUME} acabou de ser reservado por outro convidado. Que tal escolher outro?`),
  ).toBeVisible()
  await conflict.getByRole('button', { name: 'Ver outros presentes' }).click()
  await expect(conflict).toBeHidden()
  // the list came back refreshed: the gift is now taken, with no button
  await expect(tag(page, PERFUME).getByText('Já escolhido')).toBeVisible()
  await expect(section.getByRole('button', { name: `Reservar ${PERFUME}` })).toHaveCount(0)
})

test('"Ver na loja" opens the purchase link in a new tab', async ({ page }) => {
  await openGifts(page)
  const link = page.getByRole('link', { name: `Ver ${PERFUME} na loja (abre em nova aba)` })
  await expect(link).toHaveAttribute('href', STORE_URL)
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow')
  await expect(link).toBeVisible()
  // what sighted guests read; the rest of the name is visually hidden
  const shown = await link.evaluate((el) => {
    const clone = el.cloneNode(true) as HTMLElement
    clone.querySelectorAll('.sr-only').forEach((n) => n.remove())
    return clone.textContent?.trim()
  })
  expect(shown).toBe('Ver na loja')
  // gifts without a link show none
  await expect(tag(page, SKINCARE).getByRole('link')).toHaveCount(0)
})

test('a photo that fails to load is dropped from the tag', async ({ page }) => {
  await openGifts(page)
  await expect(tag(page, SKINCARE)).toBeVisible()
  await expect(tag(page, SKINCARE).locator('img')).toHaveCount(0)
})

test('shows the approximate price', async ({ page }) => {
  await openGifts(page)
  await expect(tag(page, HEADPHONES).getByText(/≈ R\$ 250/)).toBeVisible()
})

test('category chips filter the list', async ({ page }) => {
  const section = await openGifts(page)
  const chips = section.getByRole('group', { name: 'Filtrar por categoria' })
  await expect(chips.getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'true')

  await chips.getByRole('button', { name: 'Moda' }).click()
  await expect(chips.getByRole('button', { name: 'Moda' })).toHaveAttribute('aria-pressed', 'true')
  await expect(tag(page, BAG)).toBeVisible()
  await expect(tag(page, PERFUME)).toHaveCount(0)
  await expect(tag(page, HEADPHONES)).toHaveCount(0)

  await chips.getByRole('button', { name: 'Todos' }).click()
  await expect(section.locator('li')).toHaveCount(NAMES.length)
})

test('links to the Pix section when the pix flag is on', async ({ page }) => {
  const section = await openGifts(page)
  await expect(section.getByRole('link', { name: /Prefere Pix\?/ })).toHaveAttribute('href', '#pix')
})

test('gift section has no serious accessibility violations', async ({ page }) => {
  const section = await openGifts(page)
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity),
  )
  const scan = async () => {
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .include('#gifts')
      .analyze()
    return violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target.join(' ')) }))
  }
  expect(await scan()).toEqual([])

  // with a reserved (wine) tag too
  await section.getByRole('button', { name: `Reservar ${PERFUME}` }).click()
  await page.getByRole('dialog', { name: PERFUME }).getByRole('button', { name: 'Confirmar reserva' }).click()
  await expect(tag(page, PERFUME).getByText('Reservado por você')).toBeVisible()
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity),
  )
  expect(await scan()).toEqual([])
})

test('hides the section when the catalog is empty', async ({ page }) => {
  await deleteGiftsByName(NAMES)
  await page.goto(`/c/${E2E_GUEST_TOKEN}`)
  await page.getByRole('button', { name: 'Entrar sem animação' }).click()
  await expect(page.getByRole('heading', { name: 'Sua presença.' })).toBeVisible()
  await expect(page.locator('#gifts')).toHaveCount(0)
})

test.describe('after confirming presence', () => {
  test.beforeEach(() => resetE2eGuestRsvp())

  test('the RSVP screen points to the list, then thanks for the chosen gift', async ({ page }) => {
    const gifts = await openGifts(page)
    const rsvp = page.locator('#rsvp')
    await rsvp.scrollIntoViewIfNeeded()
    await rsvp.getByText('Vou com certeza').click()
    await rsvp.getByRole('button', { name: 'Confirmar presença' }).click()
    await expect(rsvp.getByRole('heading', { name: 'Presença confirmada.' })).toBeVisible()

    const cta = rsvp.getByRole('link', { name: 'Ver lista de presentes' })
    await expect(cta).toBeVisible()
    await expect(cta).toHaveAttribute('href', '#gifts')
    await expect(rsvp.getByText('Se quiser presentear, escolha algo da lista — assim ninguém repete.')).toBeVisible()
    await cta.click()
    await expect(page).toHaveURL(/#gifts$/)

    await gifts.getByRole('button', { name: `Reservar ${BAG}` }).click()
    await page.getByRole('dialog', { name: BAG }).getByRole('button', { name: 'Confirmar reserva' }).click()
    await expect(tag(page, BAG).getByText('Reservado por você')).toBeVisible()
    await expect(rsvp.getByText('Obrigada pelo presente!')).toBeVisible()
    await expect(rsvp.getByText(`Você escolheu: ${BAG}`)).toBeVisible()
    await expect(cta).toHaveCount(0)

    await gifts.getByRole('button', { name: `Desfazer reserva de ${BAG}` }).click()
    await expect(gifts.getByRole('button', { name: `Reservar ${BAG}` })).toBeVisible()
    await expect(cta).toBeVisible()
    await expect(rsvp.getByText('Obrigada pelo presente!')).toHaveCount(0)
  })
  test('a returning guest with gifts sees the thanks on load', async ({ page }) => {
    await setE2eGuestRsvp('yes')
    await reserveGiftForE2eGuest(PERFUME)
    await reserveGiftForE2eGuest(SKINCARE)
    await openGifts(page)
    const rsvp = page.locator('#rsvp')
    await expect(rsvp.getByText('Obrigada pelo presente!')).toBeVisible()
    await expect(rsvp.getByText(`Você escolheu: ${SKINCARE} e mais 1`)).toBeVisible()
    await expect(rsvp.getByRole('link', { name: 'Ver lista de presentes' })).toHaveCount(0)
  })
})
