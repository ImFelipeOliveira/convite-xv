import { sql } from 'drizzle-orm'
import {
  check,
  date,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

export const resposta = pgEnum('resposta', ['pendente', 'sim', 'nao'])

export const MSG_CONVITE_WHATSAPP_PADRAO =
  'Olá, {nome}! A Isabella vai fazer 15 anos e preparou um convite especial para você. Abra a carta: {link}'

export const convidados = pgTable(
  'convidados',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    token: text('token').notNull().unique(),
    nome: text('nome').notNull(),
    telefone: text('telefone'),
    limiteAcompanhantes: integer('limite_acompanhantes').notNull().default(0),
    resposta: resposta('resposta').notNull().default('pendente'),
    acompanhantes: integer('acompanhantes').notNull().default(0),
    recado: text('recado'),
    respondidoEm: timestamp('respondido_em', { withTimezone: true }),
    abertoEm: timestamp('aberto_em', { withTimezone: true }),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('limite_acompanhantes_faixa', sql`${t.limiteAcompanhantes} between 0 and 6`),
    check('acompanhantes_nao_negativo', sql`${t.acompanhantes} >= 0`),
  ],
)

export const admins = pgTable('admins', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  senhaHash: text('senha_hash').notNull(),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
})

export const config = pgTable(
  'config',
  {
    id: integer('id').primaryKey(),
    prazoConfirmacao: date('prazo_confirmacao').notNull().default('2026-12-13'),
    contatoDuvidas: text('contato_duvidas'),
    msgEncerramento: text('msg_encerramento'),
    msgConviteWhatsapp: text('msg_convite_whatsapp')
      .notNull()
      .default(MSG_CONVITE_WHATSAPP_PADRAO),
  },
  (t) => [check('config_linha_unica', sql`${t.id} = 1`)],
)

export type Convidado = typeof convidados.$inferSelect
export type NovoConvidado = typeof convidados.$inferInsert
export type Config = typeof config.$inferSelect
