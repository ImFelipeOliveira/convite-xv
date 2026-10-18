import { describe, expect, it } from 'vitest'
import { renderTemplate, varyGreeting } from '../message'

describe('renderTemplate', () => {
  it('fills first name and link in a single pass', () => {
    expect(
      renderTemplate('Olá, {nome}! {link} {nome}', { name: 'João Ávila', link: 'https://x/c/t' }),
    ).toBe('Olá, João! https://x/c/t João')
  })

  it('does not re-substitute placeholders found inside values', () => {
    expect(renderTemplate('{nome} {link}', { name: '{link}', link: 'https://x/c/t' })).toBe(
      '{link} https://x/c/t',
    )
  })
})

describe('renderTemplate dates', () => {
  it('fills {prazo} and {preferencia} as dd/mm when given', () => {
    expect(
      renderTemplate('{nome}: até {preferencia}, prazo {prazo}. {link}', {
        name: 'Ana',
        link: 'L',
        deadline: '2026-12-13',
        preferredDate: '2026-11-21',
      }),
    ).toBe('Ana: até 21/11, prazo 13/12. L')
  })

  it('uses the deadline for {preferencia} when there is no preferred date', () => {
    expect(
      renderTemplate('até {preferencia} {link}', { name: 'Ana', link: 'L', deadline: '2026-12-13', preferredDate: null }),
    ).toBe('até 13/12 L')
  })

  it('leaves {prazo}/{preferencia} untouched without values', () => {
    expect(renderTemplate('{prazo} {preferencia} {link}', { name: 'Ana', link: 'L' })).toBe(
      '{prazo} {preferencia} L',
    )
  })
})

describe('varyGreeting', () => {
  it('yields three different prefixes with identical tails', () => {
    const text = 'Olá, Ana! Falta uma semana.'
    const out = [0, 1, 2].map((s) => varyGreeting(text, s))
    expect(new Set(out.map((o) => o.split(' ')[0])).size).toBe(3)
    for (const o of out) expect(o.endsWith(' Ana! Falta uma semana.')).toBe(true)
  })

  it('leaves text without a leading greeting untouched', () => {
    expect(varyGreeting('Bom dia, Ana', 1)).toBe('Bom dia, Ana')
  })
})
