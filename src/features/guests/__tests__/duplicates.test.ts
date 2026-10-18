import { describe, expect, it, vi } from 'vitest'
import { makeGuest } from '../../../../tests/helpers/db'
import { importGuestsAction, saveGuestAction } from '../actions'
import { duplicatePhoneWarnings, parseGuestsCsvRows } from '../csv'
import { joinNames, otherGuestsSharingPhone } from '../duplicates'
import { formatImportWarning } from '../import-report'
import { listGuests } from '../repo'

// saveGuestAction runs behind the admin guard and revalidates a path: both stubbed here
vi.mock('@/features/admin-auth/guard', () => ({
  requireAdmin: async () => ({ adminId: '00000000-0000-4000-8000-0000000000aa' }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

const PHONE = '+5595991234567'

function form(values: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(values)) fd.set(k, v)
  return fd
}

describe('joinNames', () => {
  it('joins names the pt-BR way', () => {
    expect(joinNames(['Ana'])).toBe('Ana')
    expect(joinNames(['Ana', 'Bia'])).toBe('Ana e Bia')
    expect(joinNames(['Ana', 'Bia', 'Caio'])).toBe('Ana, Bia e Caio')
  })
})

describe('otherGuestsSharingPhone', () => {
  it('maps each guest to the names of the other guests with the same phone', () => {
    const map = otherGuestsSharingPhone([
      { id: 'a', name: 'Ana', phone: PHONE },
      { id: 'b', name: 'Bia', phone: PHONE },
      { id: 'c', name: 'Caio', phone: PHONE },
      { id: 'd', name: 'Duda', phone: '+5595988887777' },
      { id: 'e', name: 'Eva', phone: null },
      { id: 'f', name: 'Fábio', phone: null },
    ])
    expect(map.get('a')).toEqual(['Bia', 'Caio'])
    expect(map.get('c')).toEqual(['Ana', 'Bia'])
    expect(map.has('d')).toBe(false)
    expect(map.has('e')).toBe(false)
  })
})

describe('saveGuestAction duplicate phone', () => {
  it('warns without saving when another guest has the phone', async () => {
    await makeGuest({ name: 'Ana', phone: PHONE })
    await makeGuest({ name: 'Bia', phone: PHONE })
    const values = { name: 'Caio', phone: '(95) 99123-4567', plusOnesLimit: '1' }
    const res = await saveGuestAction(null, form(values))
    expect(res).toEqual({ ok: false, duplicatePhone: { names: ['Ana', 'Bia'] }, values })
    expect((await listGuests()).map((g) => g.name)).toEqual(['Ana', 'Bia'])
  })

  it('saves when the duplicate was confirmed', async () => {
    await makeGuest({ name: 'Ana', phone: PHONE })
    const res = await saveGuestAction(
      null,
      form({ name: 'Caio', phone: '(95) 99123-4567', plusOnesLimit: '1', confirmDuplicatePhone: '1' }),
    )
    expect(res).toEqual({ ok: true, message: 'Convidado adicionado.' })
    expect((await listGuests()).map((g) => [g.name, g.phone])).toEqual([
      ['Ana', PHONE],
      ['Caio', PHONE],
    ])
  })

  it("does not warn about the guest's own phone when editing", async () => {
    const ana = await makeGuest({ name: 'Ana', phone: PHONE })
    const res = await saveGuestAction(
      null,
      form({ id: ana.id, name: 'Ana Maria', phone: PHONE, plusOnesLimit: '0' }),
    )
    expect(res).toEqual({ ok: true, message: 'Convidado atualizado.' })
  })

  it('does not re-warn when editing other fields of a guest that already shares the phone', async () => {
    await makeGuest({ name: 'Ana', phone: PHONE })
    const bia = await makeGuest({ name: 'Bia', phone: PHONE })
    const res = await saveGuestAction(
      null,
      form({ id: bia.id, name: 'Bia Souza', phone: '(95) 99123-4567', plusOnesLimit: '2' }),
    )
    expect(res).toEqual({ ok: true, message: 'Convidado atualizado.' })
    expect((await listGuests()).find((g) => g.id === bia.id)?.name).toBe('Bia Souza')
  })

  it('warns when an edit moves the phone onto another guest', async () => {
    await makeGuest({ name: 'Ana', phone: PHONE })
    const bia = await makeGuest({ name: 'Bia', phone: '+5595988887777' })
    const res = await saveGuestAction(null, form({ id: bia.id, name: 'Bia', phone: PHONE, plusOnesLimit: '0' }))
    expect(res).toMatchObject({ ok: false, duplicatePhone: { names: ['Ana'] } })
  })

  it('never warns for guests without a phone', async () => {
    await makeGuest({ name: 'Ana', phone: null })
    const res = await saveGuestAction(null, form({ name: 'Bia', phone: '', plusOnesLimit: '0' }))
    expect(res).toEqual({ ok: true, message: 'Convidado adicionado.' })
  })
})

describe('CSV duplicate phone warnings', () => {
  it('parseGuestsCsvRows keeps the file line of each valid row', () => {
    expect(parseGuestsCsvRows('nome;telefone\nAna;(95) 99123-4567\n\nBia;\nCaio;123\n')).toEqual({
      rows: [
        { line: 2, name: 'Ana', phone: PHONE, plusOnesLimit: 0 },
        { line: 4, name: 'Bia', phone: null, plusOnesLimit: 0 },
      ],
      errors: [{ line: 5, reason: 'Telefone inválido' }],
    })
  })

  it('warns about rows repeating a phone in the file or of an existing guest', () => {
    const { rows } = parseGuestsCsvRows(
      [
        'nome;telefone',
        'Ana;(95) 99123-4567',
        'Bia;95991234567',
        'Caio;(95) 98888-7777',
        'Duda;',
        'Eva;',
        'Fábio;(95) 97777-6666',
      ].join('\n'),
    )
    const warnings = duplicatePhoneWarnings(rows, [{ phone: '+5595988887777', name: 'Carla' }])
    expect(warnings).toEqual([
      { line: 2, names: ['Bia'] },
      { line: 3, names: ['Ana'] },
      { line: 4, names: ['Carla'] },
    ])
    expect(warnings.map(formatImportWarning)).toEqual([
      'Linha 2: telefone repetido (Bia)',
      'Linha 3: telefone repetido (Ana)',
      'Linha 4: telefone repetido (Carla)',
    ])
  })

  it('names existing guests first, then the other rows of the file', () => {
    const { rows } = parseGuestsCsvRows('nome;telefone\nAna;(95) 99123-4567\nBia;(95) 99123-4567\n')
    expect(duplicatePhoneWarnings(rows, [{ phone: PHONE, name: 'Zé' }])).toEqual([
      { line: 2, names: ['Zé', 'Bia'] },
      { line: 3, names: ['Zé', 'Ana'] },
    ])
    expect(formatImportWarning({ line: 2, names: ['Zé', 'Bia'] })).toBe('Linha 2: telefone repetido (Zé e Bia)')
  })

  it('importGuestsAction imports duplicate rows and reports them as warnings, separate from errors', async () => {
    await makeGuest({ name: 'Carla', phone: '+5595988887777' })
    const csv = 'nome;telefone\nAna;(95) 99123-4567\nBia;(95) 99123-4567\nCaio;(95) 98888-7777\nDuda;123\n'
    const fd = new FormData()
    fd.set('file', new File([csv], 'convidados.csv', { type: 'text/csv' }))
    expect(await importGuestsAction(null, fd)).toEqual({
      imported: 3,
      errors: [{ line: 5, reason: 'Telefone inválido' }],
      warnings: [
        { line: 2, names: ['Bia'] },
        { line: 3, names: ['Ana'] },
        { line: 4, names: ['Carla'] },
      ],
    })
    expect((await listGuests()).map((g) => g.name)).toEqual(['Ana', 'Bia', 'Caio', 'Carla'])
  })
})
