import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Closing } from '../Closing'

// The e2e server runs with every flag on, so the flags-off shortcuts are pinned here.
function shortcutHrefs(): string[] {
  const html = renderToStaticMarkup(<Closing message={null} contactInfo={null} />)
  const nav = html.slice(html.indexOf('aria-label="Atalhos do convite"'))
  return [...nav.matchAll(/href="([^"]+)"/g)].map((m) => m[1])
}

describe('Closing shortcuts', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('shows only RSVP and venue while the flags are off', () => {
    vi.stubEnv('FEATURES', '')
    expect(shortcutHrefs()).toEqual(['#rsvp', '#venue'])
  })

  it('adds gifts and Pix per flag', () => {
    vi.stubEnv('FEATURES', 'gifts')
    expect(shortcutHrefs()).toEqual(['#rsvp', '#venue', '#gifts'])
    vi.stubEnv('FEATURES', 'gifts,pix')
    expect(shortcutHrefs()).toEqual(['#rsvp', '#venue', '#gifts', '#pix'])
  })
})
