import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')

const tokens: Record<string, string> = {
  '--blush': '#F7DEDB', '--papel': '#FFF8F6', '--petala': '#F0C7C6', '--lirio': '#E07A9C',
  '--rosa': '#C25578', '--lacre': '#A8325E', '--rosa-profundo': '#8E3556', '--vinho': '#5A2136',
  '--bordo': '#2A1119', '--ouro': '#B8955A', '--ouro-claro': '#E3C891', '--ouro-texto': '#7A5629',
  '--salvia': '#2F6B4F', '--erro': '#9B1C1C',
  '--ease-carta': 'cubic-bezier(.22, 1, .36, 1)', '--ease-portas': 'cubic-bezier(.65, 0, .35, 1)',
  '--ease-lacre': 'cubic-bezier(.34, 1.56, .64, 1)', '--dur-micro': '160ms', '--dur-ui': '320ms',
  '--dur-revelar': '700ms', '--dur-cena': '1200ms', '--stagger': '80ms', '--revelar-y': '24px',
}

describe('tokens do design', () => {
  for (const [nome, valor] of Object.entries(tokens)) {
    it(`define ${nome}`, () => {
      expect(css).toContain(`${nome}: ${valor}`)
    })
  }

  it('respeita prefers-reduced-motion', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
  })
})
