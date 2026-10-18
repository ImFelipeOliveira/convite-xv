import { expect, test } from '@playwright/test'
import { E2E_GUEST_NAME, E2E_GUEST_TOKEN } from './fixtures'

const invitePath = `/c/${E2E_GUEST_TOKEN}`
const appUrl = process.env.APP_URL ?? 'http://localhost:3000'

function metaContent(html: string, property: string): string | undefined {
  const tag = html.match(new RegExp(`<meta[^>]*property="${property}"[^>]*>`))?.[0]
  return tag?.match(/content="([^"]*)"/)?.[1]
}

test('invite page exposes the letter preview metadata', async ({ request }) => {
  const html = await (await request.get(invitePath)).text()

  expect(metaContent(html, 'og:title')).toBe('Isabella · 15 anos')
  expect(metaContent(html, 'og:description')).toBe('Você recebeu um convite. Toque para abrir a carta.')
  expect(metaContent(html, 'og:type')).toBe('website')
  expect(metaContent(html, 'og:image')).toMatch(new RegExp(`^${appUrl}/`))

  const ogTags = html.match(/<meta[^>]*property="og:[^>]*>/g)?.join('\n') ?? ''
  expect(ogTags).not.toContain(E2E_GUEST_NAME)
})

test('preview image is a small PNG, identical for every token', async ({ request }) => {
  const html = await (await request.get(invitePath)).text()
  const imageUrl = metaContent(html, 'og:image')
  expect(imageUrl).toBeTruthy()

  const response = await request.get(imageUrl!)
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toBe('image/png')
  const body = await response.body()
  expect(body.length).toBeLessThan(300_000)

  const other = await request.get(`${appUrl}/c/AnyOtherToken0000000000/opengraph-image`)
  expect(other.status()).toBe(200)
  expect((await other.body()).equals(body)).toBe(true)
})
