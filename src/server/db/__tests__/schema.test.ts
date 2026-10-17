import { describe, expect, it } from 'vitest'
import { db } from '@/server/db/client'
import { config, convidados } from '@/server/db/schema'
import { fabricarConvidado } from '../../../../tests/helpers/db'

describe('schema', () => {
  it('insere convidado com defaults', async () => {
    const c = await fabricarConvidado()
    expect(c.resposta).toBe('pendente')
    expect(c.acompanhantes).toBe(0)
  })

  it('rejeita limite 7', async () => {
    await expect(fabricarConvidado({ limiteAcompanhantes: 7 })).rejects.toThrow()
  })

  it('token é único', async () => {
    await fabricarConvidado({ token: 'abc' })
    await expect(fabricarConvidado({ token: 'abc' })).rejects.toThrow()
  })

  it('config tem linha única', async () => {
    await expect(db.insert(config).values({ id: 2 })).rejects.toThrow()
    const rows = await db.select().from(config)
    expect(rows).toHaveLength(1)
    expect(rows[0].prazoConfirmacao).toBe('2026-12-13')
  })

  it('limparBanco esvazia convidados', async () => {
    expect(await db.select().from(convidados)).toHaveLength(0)
  })
})
