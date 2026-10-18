import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Guest } from '@/server/db/schema'
import { buildGuestsCsv, parseGuestsCsv } from '../csv'
import { formatImportSummary } from '../import-report'

const SAMPLE =
  '\uFEFFnome;telefone;limite_acompanhantes\nJoão Ávila;(95) 99123-4567;2\nMaria;;0\n\nPedro;123;1\n'

const EXPECTED_VALID = [
  { name: 'João Ávila', phone: '+5595991234567', plusOnesLimit: 2 },
  { name: 'Maria', phone: null, plusOnesLimit: 0 },
]

describe('parseGuestsCsv', () => {
  it('parses a semicolon CSV with BOM, skipping blank lines and reporting bad phones by line', () => {
    expect(parseGuestsCsv(SAMPLE)).toEqual({
      valid: EXPECTED_VALID,
      errors: [{ line: 5, reason: 'Telefone inválido' }],
    })
  })

  it('gives the same result for a comma-separated file', () => {
    expect(parseGuestsCsv(SAMPLE.replaceAll(';', ','))).toEqual({
      valid: EXPECTED_VALID,
      errors: [{ line: 5, reason: 'Telefone inválido' }],
    })
  })

  it('requires the "nome" header', () => {
    expect(parseGuestsCsv('telefone;limite_acompanhantes\n(95) 99123-4567;1\n')).toEqual({
      valid: [],
      errors: [{ line: 1, reason: 'Cabeçalho "nome" obrigatório' }],
    })
  })

  it('rejects a plus-ones limit out of range', () => {
    expect(parseGuestsCsv('nome;limite_acompanhantes\nAna;9\nBia;6\n')).toEqual({
      valid: [{ name: 'Bia', phone: null, plusOnesLimit: 6 }],
      errors: [{ line: 2, reason: 'Limite deve ser de 0 a 6' }],
    })
  })

  it('accepts a file with only the "nome" column', () => {
    expect(parseGuestsCsv('nome\nAna\n')).toEqual({
      valid: [{ name: 'Ana', phone: null, plusOnesLimit: 0 }],
      errors: [],
    })
  })
})

describe('formatImportSummary', () => {
  it('lists line errors in the summary', () => {
    expect(formatImportSummary({ imported: 2, errors: [{ line: 5, reason: 'Telefone inválido' }] })).toBe(
      '2 importados, 1 erro (linha 5: Telefone inválido)',
    )
  })

  it('uses singular and omits errors when there are none', () => {
    expect(formatImportSummary({ imported: 1, errors: [] })).toBe('1 importado')
  })
})

describe('buildGuestsCsv', () => {
  afterEach(() => vi.unstubAllEnvs())

  const guest: Guest = {
    id: '00000000-0000-4000-8000-000000000001',
    token: 'abc',
    name: 'João Ávila',
    phone: '+5595991234567',
    plusOnesLimit: 2,
    rsvpStatus: 'yes',
    plusOnes: 1,
    message: 'Parabéns; muitas felicidades\nbeijos',
    respondedAt: new Date('2026-12-13T03:05:00Z'),
    openedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  it('starts with a BOM, uses ";" and quotes fields with ";" or line breaks', () => {
    vi.stubEnv('APP_URL', 'https://convite.example.com')
    const csv = buildGuestsCsv([guest])
    expect(csv.startsWith('\uFEFF')).toBe(true)
    const [header, ...rest] = csv.slice(1).split('\r\n')
    expect(header).toBe(
      'nome;telefone;limite_acompanhantes;resposta;acompanhantes;recado;respondido_em;link',
    )
    expect(rest.join('\r\n')).toBe(
      'João Ávila;(95) 99123-4567;2;Sim;1;"Parabéns; muitas felicidades\nbeijos";12/12/2026 23:05;https://convite.example.com/c/abc',
    )
  })

  it('leaves blanks for pending guests without phone', () => {
    vi.stubEnv('APP_URL', 'https://convite.example.com')
    const csv = buildGuestsCsv([
      { ...guest, phone: null, rsvpStatus: 'pending', plusOnes: 0, message: null, respondedAt: null },
    ])
    expect(csv.slice(1).split('\r\n')[1]).toBe(
      'João Ávila;;2;Pendente;0;;;https://convite.example.com/c/abc',
    )
  })

  it('neutralizes spreadsheet formulas', () => {
    vi.stubEnv('APP_URL', 'https://convite.example.com')
    const csv = buildGuestsCsv([{ ...guest, name: '=HYPERLINK("x")', message: null }])
    expect(csv).not.toMatch(/\n=HYPERLINK/)
  })
})
