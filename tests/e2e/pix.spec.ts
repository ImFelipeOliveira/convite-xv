import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { deleteGiftsByName, deletePixPaymentsForTokens, resetE2eGuestRsvp, seedGifts, setE2eGuestRsvp } from './db'
import {
  fakeAsaasCalls,
  resetFakeAsaas,
  sendFakeAsaasWebhook,
  setFakeAsaasMode,
  setLatestFakeChargeStatus,
} from './fake-asaas'
import { E2E_GUEST_TOKEN } from './fixtures'

// The invite's Pix section (prancha 09) against the fake Asaas (tests/e2e/fake-asaas.ts). The webServer
// runs with FEATURES=gifts,pix, ASAAS_REQUIRE_PAYER_CPF=true and ASAAS_WEBHOOK_TOKEN set: payments are
// settled through the real webhook (the fake POSTs /api/webhooks/asaas, sendFakeAsaasWebhook) and show up
// on the guest's next 5 s status poll. One test covers the poll fallback (PIX_POLL_AFTER_MS=0).
const VALID_CPF = '529.982.247-25'
const GIFT = 'E2E Pix Caneca'

// review screenshots (390×844): E2E_SCREENS_DIR=… pnpm test:e2e pix
const SCREENS = process.env.E2E_SCREENS_DIR
async function shot(target: Page | Locator, name: string) {
  if (SCREENS) await target.screenshot({ path: `${SCREENS}/pix-invite-${name}.png`, animations: 'disabled' })
}

test.use({ viewport: { width: 390, height: 844 }, permissions: ['clipboard-read', 'clipboard-write'] })

// every test its own client IP: the per-IP limits (10 charges/min) never collide across tests
let ipSeq = 40
test.beforeEach(async ({ page }) => {
  await page.setExtraHTTPHeaders({ 'x-forwarded-for': `203.0.113.${ipSeq++}` })
  await resetFakeAsaas()
  await deletePixPaymentsForTokens([E2E_GUEST_TOKEN])
})

test.afterEach(async () => {
  await resetFakeAsaas()
  await deletePixPaymentsForTokens([E2E_GUEST_TOKEN])
  await resetE2eGuestRsvp()
})

async function openPix(page: Page, { reload = false } = {}) {
  await page.goto(`/c/${E2E_GUEST_TOKEN}`)
  // a returning visitor skips the opening (remembered in localStorage)
  if (!reload) await page.getByRole('button', { name: 'Entrar sem animação' }).click()
  const section = page.locator('#pix')
  await section.scrollIntoViewIfNeeded()
  await expect(section.getByRole('heading', { name: 'Um presente em Pix.' })).toBeVisible()
  return section
}

async function settle(page: Page) {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity),
  )
}

function cpfInput(section: Locator) {
  return section.getByRole('textbox', { name: 'CPF de quem vai pagar' })
}

test('R$ 100: shows the QR and copy-paste code, copies it, then turns paid after the bank confirms', async ({ page }) => {
  const section = await openPix(page)
  await expect(section.getByText('CAPÍTULO VI')).toBeVisible()
  const chips = section.getByRole('group', { name: 'ESCOLHA UM VALOR' })
  for (const label of ['R$ 70', 'R$ 100', 'R$ 150', 'R$ 200', 'R$ 300', 'Outro valor']) {
    await expect(chips.getByRole('button', { name: label, exact: true })).toBeVisible()
  }
  await chips.getByRole('button', { name: 'R$ 100', exact: true }).click()
  await expect(chips.getByRole('button', { name: 'R$ 100', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(section.getByText('SEU PRESENTE')).toBeVisible()
  await expect(section.getByTestId('pix-amount')).toHaveText('R$ 100,00')
  await expect(section.getByTestId('pix-from')).toHaveText('Convidado')
  await expect(section.getByText('Usado só para gerar o Pix no Asaas.')).toBeVisible()
  await cpfInput(section).fill('52998224725')
  // masked as the guest types
  await expect(cpfInput(section)).toHaveValue(VALID_CPF)
  await shot(section, 'choose')

  await section.getByRole('button', { name: 'Gerar Pix' }).click()
  await expect(section.getByRole('img', { name: /QR Code Pix de R\$ 100,00/ })).toBeVisible()
  await expect(section.getByText('AGUARDANDO PAGAMENTO')).toBeVisible()
  const code = section.getByRole('textbox', { name: 'PIX COPIA E COLA' })
  await expect(code).toHaveValue(/^00020126/)
  for (const step of [
    'Abra o app do seu banco e escolha Pix.',
    'Leia o QR Code ou cole o código copiado.',
    'Confira o valor e o nome do recebedor antes de pagar.',
  ]) {
    await expect(section.getByText(step)).toBeVisible()
  }
  await settle(page)
  await shot(section, 'qr')

  await section.getByRole('button', { name: 'Copiar' }).click()
  await expect(section.getByRole('status').filter({ hasText: 'Código copiado' })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await code.inputValue())
  // the CPF went to Asaas once (customer), never stored on the page
  expect((await fakeAsaasCalls()).filter((c) => c === 'POST /customers')).toHaveLength(1)

  // the bank confirms: Asaas delivers PAYMENT_RECEIVED to our webhook (a redelivery is a no-op)
  expect(await sendFakeAsaasWebhook('PAYMENT_RECEIVED', 'evt_e2e_received')).toEqual({ status: 200, body: { ok: true } })
  expect(await sendFakeAsaasWebhook('PAYMENT_RECEIVED', 'evt_e2e_received')).toEqual({
    status: 200,
    body: { ok: true, duplicate: true },
  })
  await expect(section.getByRole('heading', { name: 'Pix recebido.' })).toBeVisible({ timeout: 15_000 })
  // the QR step is gone: focus lands on the thanks
  await expect(section.getByRole('heading', { name: 'Pix recebido.' })).toBeFocused()
  await expect(section.getByText('Muito obrigada!', { exact: true })).toBeVisible()
  await expect(section.getByText('PAGO', { exact: true })).toBeVisible()
  await expect(section.getByText('Seu carinho chegou. Obrigada por fazer parte desse dia!')).toBeVisible()
  await settle(page)
  await shot(section, 'paid')

  // a late OVERDUE never downgrades a paid Pix
  expect(await sendFakeAsaasWebhook('PAYMENT_OVERDUE')).toEqual({ status: 200, body: { ok: true } })
  const again = await openPix(page, { reload: true })
  await expect(again.getByRole('heading', { name: 'Pix recebido.' })).toBeVisible()
})

test('without a webhook, the status poll still picks up the payment', async ({ page }) => {
  const section = await openPix(page)
  await cpfInput(section).fill(VALID_CPF)
  await section.getByRole('button', { name: 'Gerar Pix' }).click()
  await expect(section.getByText('AGUARDANDO PAGAMENTO')).toBeVisible()
  // only the fake's charge status changes: the app asks Asaas itself (fallback poll)
  await setLatestFakeChargeStatus('RECEIVED')
  await expect(section.getByRole('heading', { name: 'Pix recebido.' })).toBeVisible({ timeout: 15_000 })
})

test('"Outro valor" below R$ 70 shows the minimum and never calls Asaas', async ({ page }) => {
  const section = await openPix(page)
  await section.getByRole('button', { name: 'Outro valor' }).click()
  const input = section.getByRole('textbox', { name: 'OUTRO VALOR' })
  await expect(section.getByText('A partir de R$ 70,00.')).toBeVisible()
  await input.fill('50')
  await cpfInput(section).fill(VALID_CPF)
  await section.getByRole('button', { name: 'Gerar Pix' }).click()
  await expect(section.getByRole('alert')).toHaveText('O valor mínimo para presentear via Pix é de R$ 70,00.')
  await expect(input).toHaveAttribute('aria-invalid', 'true')
  await shot(section, 'min-error')
  expect(await fakeAsaasCalls()).toEqual([])

  // a typed "." is the decimal separator, never thousands
  await input.fill('70.5')
  await expect(input).toHaveValue('70,5')
  await expect(section.getByTestId('pix-amount')).toHaveText('R$ 70,50')
  await input.fill('1250')
  await expect(section.getByTestId('pix-amount')).toHaveText('R$ 1.250,00')

  // above R$ 10.000,00: refused before any call
  await input.fill('10000,01')
  await section.getByRole('button', { name: 'Gerar Pix' }).click()
  await expect(section.getByRole('alert')).toHaveText('O valor máximo é R$ 10.000,00.')
  await expect(input).toHaveAttribute('aria-invalid', 'true')
  expect(await fakeAsaasCalls()).toEqual([])

  // "1.000" (dots only) looks like a thousands separator: hint first, never read as R$ 1,00
  await input.fill('1.000')
  await expect(input).toHaveValue('1.000')
  await expect(section.getByText('Digite sem ponto (ex.: 1000,00).')).toBeVisible()
  await section.getByRole('button', { name: 'Gerar Pix' }).click()
  await expect(input).toBeFocused()
  expect(await fakeAsaasCalls()).toEqual([])
  await input.fill('1000')
  await expect(section.getByText('Digite sem ponto (ex.: 1000,00).')).toHaveCount(0)
  await expect(section.getByTestId('pix-amount')).toHaveText('R$ 1.000,00')
  // a full pt-BR amount ("1.000,00") is valid: the dots are thousands separators
  await input.fill('1.000,00')
  await expect(input).toHaveValue('1000,00')
  await expect(section.getByText('Digite sem ponto (ex.: 1000,00).')).toHaveCount(0)
  await expect(section.getByTestId('pix-amount')).toHaveText('R$ 1.000,00')
  await input.fill('100.50')
  await expect(input).toHaveValue('100,50')
  await expect(section.getByTestId('pix-amount')).toHaveText('R$ 100,50')
  await section.getByRole('button', { name: 'Gerar Pix' }).click()
  await expect(section.getByRole('img', { name: /QR Code Pix de R\$ 100,50/ })).toBeVisible()
})

test('an invalid CPF is caught before any call', async ({ page }) => {
  const section = await openPix(page)
  await cpfInput(section).fill('529.982.247-24')
  await section.getByRole('button', { name: 'Gerar Pix' }).click()
  await expect(section.getByText('CPF inválido. Confira os números.')).toBeVisible()
  await expect(cpfInput(section)).toHaveAttribute('aria-invalid', 'true')
  expect(await fakeAsaasCalls()).toEqual([])
})

test('an Asaas failure shows the error and a retry works', async ({ page }) => {
  const section = await openPix(page)
  await setFakeAsaasMode({ failPayments: true })
  await cpfInput(section).fill(VALID_CPF)
  await section.getByRole('button', { name: 'Gerar Pix' }).click()
  await expect(section.getByText('Não foi possível gerar o Pix agora.')).toBeVisible()
  await shot(section, 'error')

  await setFakeAsaasMode({ failPayments: false })
  await section.getByRole('button', { name: 'Gerar Pix' }).click()
  await expect(section.getByRole('img', { name: /QR Code Pix/ })).toBeVisible()
})

test('shows "Gerando Pix…" while the charge is created, and "Trocar o valor" goes back', async ({ page }) => {
  const section = await openPix(page)
  await setFakeAsaasMode({ latencyMs: 600 })
  await cpfInput(section).fill(VALID_CPF)
  await section.getByRole('button', { name: 'Gerar Pix' }).click()
  await expect(section.getByRole('button', { name: 'Gerando Pix…' })).toBeDisabled()
  await expect(section.getByRole('img', { name: /QR Code Pix/ })).toBeVisible()

  await section.getByRole('button', { name: 'Trocar o valor' }).click()
  await expect(section.getByRole('group', { name: 'ESCOLHA UM VALOR' })).toBeVisible()
  // the CPF is not kept after a successful generation
  await expect(cpfInput(section)).toHaveValue('')
})

test('an expired charge asks for a new one', async ({ page }) => {
  const section = await openPix(page)
  await cpfInput(section).fill(VALID_CPF)
  await section.getByRole('button', { name: 'Gerar Pix' }).click()
  await expect(section.getByRole('img', { name: /QR Code Pix/ })).toBeVisible()
  await sendFakeAsaasWebhook('PAYMENT_OVERDUE')
  await expect(section.getByText('Este Pix expirou. Gere um novo.')).toBeVisible({ timeout: 15_000 })
  await expect(section.getByRole('button', { name: 'Gerar Pix' })).toBeVisible()
})

test('when polling gives up, the guest can still check the payment once', async ({ page }) => {
  const section = await openPix(page)
  await cpfInput(section).fill(VALID_CPF)
  await section.getByRole('button', { name: 'Gerar Pix' }).click()
  await expect(section.getByRole('img', { name: /QR Code Pix/ })).toBeVisible()
  // the charge disappears on our side: the next poll answers not_found and polling stops
  await deletePixPaymentsForTokens([E2E_GUEST_TOKEN])
  await expect(section.getByText('Já pagou? Toque para verificar.')).toBeVisible({ timeout: 15_000 })
  await expect(section.getByText(/A confirmação aparece aqui sozinha/)).toHaveCount(0)
  await section.getByRole('button', { name: 'Verificar pagamento' }).click()
  await expect(section.getByRole('button', { name: 'Verificar pagamento' })).toBeVisible()
  await expect(section.getByText('Já pagou? Toque para verificar.')).toBeVisible()
})

test('the CPF never reaches a URL, even if the form is submitted before hydration', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    javaScriptEnabled: false,
    extraHTTPHeaders: { 'x-forwarded-for': '203.0.113.39' },
  })
  try {
    const page = await context.newPage()
    const urls: string[] = []
    page.on('request', (r) => urls.push(r.url()))
    await page.goto(`/c/${E2E_GUEST_TOKEN}`)
    const form = page.locator('#pix form')
    await expect(form).toHaveAttribute('method', 'post')
    // no input of the form carries a name, so a native submit sends none of them
    await expect(form.locator('input[name], select[name], textarea[name]')).toHaveCount(0)
    // not exposed to the a11y tree yet (the opening still covers the invite): target it by id
    const cpf = form.locator('#pix-cpf')
    await cpf.fill(VALID_CPF, { force: true })
    // a native submit (no React handler without JS); the section is still behind the opening overlay
    await Promise.all([page.waitForEvent('load'), form.evaluate((f: HTMLFormElement) => f.requestSubmit())])
    for (const url of [...urls, page.url()]) {
      expect(url).not.toContain('cpf')
      expect(url).not.toContain('52998224725')
      expect(url).not.toContain('529.982')
    }
  } finally {
    await context.close()
  }
})

test('a reload keeps showing the pending QR', async ({ page }) => {
  const section = await openPix(page)
  await cpfInput(section).fill(VALID_CPF)
  await section.getByRole('button', { name: 'Gerar Pix' }).click()
  const code = await section.getByRole('textbox', { name: 'PIX COPIA E COLA' }).inputValue()
  const again = await openPix(page, { reload: true })
  await expect(again.getByRole('textbox', { name: 'PIX COPIA E COLA' })).toHaveValue(code)
  await expect(again.getByText('AGUARDANDO PAGAMENTO')).toBeVisible()
})

test.describe('with the gift list', () => {
  test.beforeEach(async () => {
    await seedGifts([{ name: GIFT, category: 'Casa' }])
    await setE2eGuestRsvp('yes')
  })
  test.afterEach(() => deleteGiftsByName([GIFT]))

  test('a paid Pix turns the RSVP shortcut into thanks, also after a reload', async ({ page }) => {
    const section = await openPix(page)
    const rsvp = page.locator('#rsvp')
    await expect(rsvp.getByRole('link', { name: 'Ver lista de presentes' })).toBeVisible()

    await section.getByRole('button', { name: 'R$ 150', exact: true }).click()
    await cpfInput(section).fill(VALID_CPF)
    await section.getByRole('button', { name: 'Gerar Pix' }).click()
    await expect(section.getByText('AGUARDANDO PAGAMENTO')).toBeVisible()
    await sendFakeAsaasWebhook('PAYMENT_CONFIRMED')
    await expect(section.getByRole('heading', { name: 'Pix recebido.' })).toBeVisible({ timeout: 15_000 })

    await expect(rsvp.getByText('Obrigada pelo presente!')).toBeVisible()
    await expect(rsvp.getByText('Você enviou um Pix de R$ 150,00.')).toBeVisible()
    await expect(rsvp.getByRole('link', { name: 'Ver lista de presentes' })).toHaveCount(0)

    // reserving and undoing a gift does not bring the shortcut back
    const gifts = page.locator('#gifts')
    await gifts.getByRole('button', { name: `Reservar ${GIFT}` }).click()
    await page.getByRole('dialog', { name: GIFT }).getByRole('button', { name: 'Confirmar reserva' }).click()
    await gifts.getByRole('button', { name: `Desfazer reserva de ${GIFT}` }).click()
    await expect(gifts.getByRole('button', { name: `Reservar ${GIFT}` })).toBeVisible()
    await expect(rsvp.getByText('Obrigada pelo presente!')).toBeVisible()
    await expect(rsvp.getByRole('link', { name: 'Ver lista de presentes' })).toHaveCount(0)

    await openPix(page, { reload: true })
    await expect(rsvp.getByText('Você enviou um Pix de R$ 150,00.')).toBeVisible()
    await expect(section.getByRole('heading', { name: 'Pix recebido.' })).toBeVisible()
  })
})

test('Pix section has no serious accessibility violations', async ({ page }) => {
  const section = await openPix(page)
  const scan = async () => {
    await settle(page)
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .include('#pix')
      .analyze()
    return violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target.join(' ')) }))
  }
  expect(await scan()).toEqual([])

  await section.getByRole('button', { name: 'Outro valor' }).click()
  await section.getByRole('textbox', { name: 'OUTRO VALOR' }).fill('10')
  await section.getByRole('textbox', { name: 'OUTRO VALOR' }).blur()
  await expect(section.getByRole('alert')).toBeVisible()
  expect(await scan()).toEqual([])

  await section.getByRole('button', { name: 'R$ 70', exact: true }).click()
  await cpfInput(section).fill(VALID_CPF)
  await section.getByRole('button', { name: 'Gerar Pix' }).click()
  await expect(section.getByRole('img', { name: /QR Code Pix/ })).toBeVisible()
  expect(await scan()).toEqual([])

  await sendFakeAsaasWebhook('PAYMENT_RECEIVED')
  await expect(section.getByRole('heading', { name: 'Pix recebido.' })).toBeVisible({ timeout: 15_000 })
  expect(await scan()).toEqual([])
})
