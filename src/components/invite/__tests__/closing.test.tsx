import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Closing } from '../Closing'

// The e2e server runs with every flag on, so the flags-off shortcuts are pinned here.
function shortcutHrefs(hasGifts = false): string[] {
  const html = renderToStaticMarkup(<Closing message={null} contactInfo={null} hasGifts={hasGifts} />)
  const nav = html.slice(html.indexOf('aria-label="Atalhos do convite"'))
  return [...nav.matchAll(/href="([^"]+)"/g)].map((m) => m[1])
}

describe('Closing shortcuts', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('shows only RSVP and venue while the flags are off', () => {
    vi.stubEnv('FEATURES', '')
    expect(shortcutHrefs()).toEqual(['#rsvp', '#venue'])
  })

  it('shows gifts only when the gift section renders (flag on and a non-empty catalog: hasGifts)', () => {
    vi.stubEnv('FEATURES', 'gifts')
    // flag on, empty catalog: no #gifts section, so no dead shortcut
    expect(shortcutHrefs(false)).toEqual(['#rsvp', '#venue'])
    expect(shortcutHrefs(true)).toEqual(['#rsvp', '#venue', '#gifts'])
  })

  it('adds Pix per flag', () => {
    vi.stubEnv('FEATURES', 'gifts,pix')
    expect(shortcutHrefs(true)).toEqual(['#rsvp', '#venue', '#gifts', '#pix'])
    expect(shortcutHrefs(false)).toEqual(['#rsvp', '#venue', '#pix'])
  })
})
