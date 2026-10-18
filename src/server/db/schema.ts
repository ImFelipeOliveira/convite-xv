import { sql } from 'drizzle-orm'
import {
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

export const rsvpStatus = pgEnum('rsvp_status', ['pending', 'yes', 'no'])

// User-facing pt-BR copy: stays in Portuguese.
export const WHATSAPP_INVITE_TEMPLATE_DEFAULT =
  'Olá, {nome}! A Isabella vai fazer 15 anos e preparou um convite especial para você. Abra a carta: {link}'

export const REMINDER_D7_TEXT_DEFAULT =
  'Olá, {nome}! Falta uma semana para os 15 anos da Isabella. Domingo, 27/12, às 10h, no Sítio Lua Azul (Cantá–RR). Traje livre e roupa de banho para a piscina. Seu convite: {link}'
export const REMINDER_D1_TEXT_DEFAULT =
  'Olá, {nome}! É amanhã: 15 anos da Isabella, domingo às 10h no Sítio Lua Azul. Como chegar e todos os detalhes: {link}'

export const dispatchKind = pgEnum('dispatch_kind', ['invite', 'reminder_d7', 'reminder_d1'])
export const dispatchStatus = pgEnum('dispatch_status', [
  'scheduled',
  'sending',
  'sent',
  'failed',
  'cancelled',
])

export const guests = pgTable(
  'guests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    token: text('token').notNull().unique(),
    name: text('name').notNull(),
    phone: text('phone'),
    plusOnesLimit: integer('plus_ones_limit').notNull().default(0),
    rsvpStatus: rsvpStatus('rsvp_status').notNull().default('pending'),
    plusOnes: integer('plus_ones').notNull().default(0),
    message: text('message'),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    openedAt: timestamp('opened_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('plus_ones_limit_range', sql`${t.plusOnesLimit} between 0 and 6`),
    check('plus_ones_non_negative', sql`${t.plusOnes} >= 0`),
  ],
)

export const admins = pgTable('admins', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const settings = pgTable(
  'settings',
  {
    id: integer('id').primaryKey(),
    rsvpDeadline: date('rsvp_deadline').notNull().default('2026-12-13'),
    contactInfo: text('contact_info'),
    closingMessage: text('closing_message'),
    whatsappInviteTemplate: text('whatsapp_invite_template')
      .notNull()
      .default(WHATSAPP_INVITE_TEMPLATE_DEFAULT),
    reminderD7Text: text('reminder_d7_text').notNull().default(REMINDER_D7_TEXT_DEFAULT),
    reminderD1Text: text('reminder_d1_text').notNull().default(REMINDER_D1_TEXT_DEFAULT),
  },
  (t) => [check('settings_single_row', sql`${t.id} = 1`)],
)

export const messageDispatches = pgTable(
  'message_dispatches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guestId: uuid('guest_id')
      .notNull()
      .references(() => guests.id, { onDelete: 'cascade' }),
    kind: dispatchKind('kind').notNull(),
    status: dispatchStatus('status').notNull(),
    attempts: integer('attempts').notNull().default(0),
    errorCode: text('error_code'),
    providerMessageId: text('provider_message_id'),
    adminId: uuid('admin_id').references(() => admins.id, { onDelete: 'set null' }),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('message_dispatches_status_scheduled_for_idx').on(t.status, t.scheduledFor),
    uniqueIndex('message_dispatches_guest_kind_uniq')
      .on(t.guestId, t.kind)
      .where(sql`${t.kind} <> 'invite'`),
  ],
)

export type Guest = typeof guests.$inferSelect
export type NewGuest = typeof guests.$inferInsert
export type Settings = typeof settings.$inferSelect
export type RsvpStatus = (typeof rsvpStatus.enumValues)[number]
export type MessageDispatch = typeof messageDispatches.$inferSelect
export type DispatchKind = (typeof dispatchKind.enumValues)[number]
export type DispatchStatus = (typeof dispatchStatus.enumValues)[number]
