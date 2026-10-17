import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')

const tokens: Record<string, string> = {
  '--blush': '#F7DEDB', '--paper': '#FFF8F6', '--petal': '#F0C7C6', '--lily': '#E07A9C',
  '--rose': '#C25578', '--seal': '#A8325E', '--deep-rose': '#8E3556', '--wine': '#5A2136',
  '--burgundy': '#2A1119', '--gold': '#B8955A', '--gold-light': '#E3C891', '--gold-text': '#7A5629',
  '--sage': '#2F6B4F', '--error': '#9B1C1C',
  '--ease-letter': 'cubic-bezier(.22, 1, .36, 1)', '--ease-doors': 'cubic-bezier(.65, 0, .35, 1)',
  '--ease-seal': 'cubic-bezier(.34, 1.56, .64, 1)', '--dur-micro': '160ms', '--dur-ui': '320ms',
  '--dur-reveal': '700ms', '--dur-scene': '1200ms', '--stagger': '80ms', '--reveal-y': '24px',
}

describe('design tokens', () => {
  for (const [name, value] of Object.entries(tokens)) {
    it(`defines ${name}`, () => {
      expect(css).toContain(`${name}: ${value}`)
    })
  }

  it('respects prefers-reduced-motion', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
  })
})
