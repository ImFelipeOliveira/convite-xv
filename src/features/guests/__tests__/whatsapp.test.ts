import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { inviteUrl, whatsappUrl } from '../whatsapp'

describe('whatsapp links', () => {
  beforeEach(() => vi.stubEnv('APP_URL', 'https://convite.example.com'))
  afterEach(() => vi.unstubAllEnvs())

  it('builds the invite URL from APP_URL', () => {
    expect(inviteUrl('abc')).toBe('https://convite.example.com/c/abc')
  })

  it('sends to the guest phone with first name and link filled in', () => {
    const url = whatsappUrl(
      { name: 'João Ávila', phone: '+5595991234567', token: 'abc' },
      'Olá, {nome}! {link}',
    )
    const prefix = 'https://wa.me/5595991234567?text='
    expect(url.startsWith(prefix)).toBe(true)
    expect(decodeURIComponent(url.slice(prefix.length))).toBe(
      'Olá, João! https://convite.example.com/c/abc',
    )
  })

  it('opens the contact picker when there is no phone', () => {
    const url = whatsappUrl({ name: 'Maria', phone: null, token: 'xyz' }, '{nome}: {link} ({nome})')
    const prefix = 'https://wa.me/?text='
    expect(url.startsWith(prefix)).toBe(true)
    expect(decodeURIComponent(url.slice(prefix.length))).toBe(
      'Maria: https://convite.example.com/c/xyz (Maria)',
    )
  })
})
