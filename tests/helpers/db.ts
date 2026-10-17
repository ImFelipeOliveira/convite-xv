import { randomBytes } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { config, convidados, type Convidado, type NovoConvidado } from '@/server/db/schema'

export async function limparBanco(): Promise<void> {
  await db.execute(sql`TRUNCATE convidados, admins, config RESTART IDENTITY CASCADE`)
}

export async function reinserirConfig(): Promise<void> {
  await db.insert(config).values({ id: 1 }).onConflictDoNothing()
}

export async function fabricarConvidado(over: Partial<NovoConvidado> = {}): Promise<Convidado> {
  const [row] = await db
    .insert(convidados)
    .values({
      token: randomBytes(16).toString('hex'),
      nome: 'Convidado Teste',
      limiteAcompanhantes: 2,
      ...over,
    })
    .returning()
  return row
}
