import { expect, test, type Page } from '@playwright/test'
import { MAX_DEADLINE, todayInBoaVista } from '../../src/features/settings/schema'
import { resetE2eGuestRsvp, resetE2eSettings, setE2eSettings } from './db'
import { E2E_GUEST_NAME, E2E_GUEST_TOKEN } from './fixtures'

const invitePath = `/c/${E2E_GUEST_TOKEN}`

test.use({ viewport: { width: 390, height: 844 } })

// The e2e guest has a limit of 2 plus-ones and no phone; every test starts (and leaves it) unanswered.
test.beforeEach(async ({ page }) => {
  await resetE2eGuestRsvp()
  await openInvite(page)
})

test.afterEach(async () => {
  await resetE2eGuestRsvp()
})

async function openInvite(page: Page) {
  await page.goto(invitePath)
  await page.getByRole('button', { name: 'Entrar sem animação' }).click()
}

function rsvp(page: Page) {
  return page.locator('#rsvp')
}

test('greets the guest and starts unanswered', async ({ page }) => {
  const section = rsvp(page)
  await expect(section.getByRole('heading', { name: 'Sua presença.' })).toBeVisible()
  await expect(section.getByText('AGUARDANDO RESPOSTA', { exact: true })).toBeVisible()
  await expect(section.getByText(E2E_GUEST_NAME)).toBeVisible()
  await expect(section.getByText(/Este convite é só seu — responda (de preferência )?até \d{2}\/\d{2}\./)).toBeVisible()
  await expect(section.getByRole('button', { name: 'Confirmar presença' })).toBeDisabled()
})

test.describe('preferred answer date', () => {
  // dates derived from today (Boa Vista) so the spec never depends on the calendar
  const DEADLINE = MAX_DEADLINE
  const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
  const today = todayInBoaVista()
  const tomorrow = new Date(Date.parse(`${today}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
  const preferred = tomorrow < DEADLINE ? tomorrow : DEADLINE

  test.beforeEach(() => {
    test.skip(today > DEADLINE, 'RSVP is closed for every possible deadline')
  })

  test.afterEach(async () => {
    await resetE2eSettings()
  })

  test('shows the preferred date and the final deadline', async ({ page }) => {
    await setE2eSettings({ rsvpDeadline: DEADLINE, rsvpPreferredDate: preferred })
    // already opened once (beforeEach): a returning visitor skips the opening
    await page.reload()
    await expect(
      rsvp(page).getByText(
        `Este convite é só seu — responda de preferência até ${dm(preferred)}. O prazo final é ${dm(DEADLINE)}.`,
      ),
    ).toBeVisible()
  })

  test('without a preferred date shows only the deadline', async ({ page }) => {
    await setE2eSettings({ rsvpDeadline: DEADLINE, rsvpPreferredDate: null })
    await page.reload()
    await expect(rsvp(page).getByText(`Este convite é só seu — responda até ${dm(DEADLINE)}.`)).toBeVisible()
    await expect(rsvp(page).getByText(/de preferência/)).toHaveCount(0)
  })
})

test('confirms with plus-ones and phone', async ({ page }) => {
  const section = rsvp(page)
  await section.getByText('Vou com certeza').click()
  await expect(section.getByRole('radio', { name: /Vou com certeza/ })).toBeChecked()

  const add = section.getByRole('button', { name: 'Adicionar acompanhante' })
  await add.click()
  await add.click()
  await expect(add).toBeDisabled()
  await expect(section.getByText('Limite do seu convite atingido.')).toBeVisible()

  await expect(section.getByText('Usaremos só para lembrar você da festa.')).toBeVisible()
  await section.getByLabel('Seu WhatsApp para lembretes (opcional)').fill('(95) 99123-4567')
  await section.getByRole('button', { name: 'Confirmar presença' }).click()

  await expect(section.getByRole('heading', { name: 'Presença confirmada.' })).toBeVisible()
  await expect(section.getByText('Até lá!')).toBeVisible()
  await expect(section.getByText('Você + 2')).toBeVisible()
  await expect(section.getByText('CONFIRMADA', { exact: true })).toBeVisible()
  await expect(section.getByText(/^Resposta registrada em \d{2}\/\d{2} às \d{2}h\d{2}$/)).toBeVisible()
  await expect(section.getByRole('link', { name: 'Adicionar à agenda' })).toHaveAttribute(
    'href',
    `/c/${E2E_GUEST_TOKEN}/calendar.ics`,
  )

  // second visit: the opening is skipped, the saved answer opens straight on the final screen
  await page.reload()
  await expect(section.getByRole('heading', { name: 'Presença confirmada.' })).toBeVisible()
  await expect(section.getByText('Você + 2')).toBeVisible()
})

test('declines', async ({ page }) => {
  const section = rsvp(page)
  await section.getByText('Não poderei ir').click()
  await expect(section.getByLabel('Seu WhatsApp para lembretes (opcional)')).toHaveCount(0)
  await expect(section.getByRole('button', { name: 'Adicionar acompanhante' })).toHaveCount(0)
  await section.getByRole('button', { name: 'Enviar resposta' }).click()

  await expect(section.getByRole('heading', { name: 'Que pena.' })).toBeVisible()
  await expect(section.getByText(/^Obrigada por avisar\./)).toBeVisible()
  await expect(section.getByText('RECUSADA', { exact: true })).toBeVisible()
})

test('changes the answer', async ({ page }) => {
  const section = rsvp(page)
  await section.getByText('Vou com certeza').click()
  await section.getByRole('button', { name: 'Adicionar acompanhante' }).click()
  await section.getByLabel('Recado para a Isabella').fill('Parabéns!')
  await section.getByRole('button', { name: 'Confirmar presença' }).click()
  await expect(section.getByRole('heading', { name: 'Presença confirmada.' })).toBeVisible()

  await section.getByRole('button', { name: 'Alterar resposta' }).click()
  await expect(section.getByRole('radio', { name: /Vou com certeza/ })).toBeChecked()
  await expect(section.getByRole('radio', { name: /Não poderei ir/ })).not.toBeChecked()
  await expect(section.getByRole('group', { name: 'ACOMPANHANTES' }).getByText('1', { exact: true })).toBeVisible()
  await expect(section.getByLabel('Recado para a Isabella')).toHaveValue('Parabéns!')
})

test('invalid phone', async ({ page }) => {
  const section = rsvp(page)
  await section.getByText('Vou com certeza').click()
  await section.getByRole('button', { name: 'Adicionar acompanhante' }).click()
  await section.getByLabel('Recado para a Isabella').fill('Até lá!')
  const phone = section.getByLabel('Seu WhatsApp para lembretes (opcional)')
  await phone.fill('123')
  await section.getByRole('button', { name: 'Confirmar presença' }).click()

  await expect(section.getByText('Telefone inválido. Use DDD + número.')).toBeVisible()
  await expect(phone).toHaveValue('123')
  await expect(phone).toHaveAttribute('aria-invalid', 'true')
  await expect(section.getByRole('radio', { name: /Vou com certeza/ })).toBeChecked()
  await expect(section.getByRole('group', { name: 'ACOMPANHANTES' }).getByText('1', { exact: true })).toBeVisible()
  await expect(section.getByLabel('Recado para a Isabella')).toHaveValue('Até lá!')
  await expect(section.getByRole('heading', { name: 'Presença confirmada.' })).toHaveCount(0)
})
