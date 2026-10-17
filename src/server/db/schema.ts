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

export const rsvpStatus = pgEnum('rsvp_status', ['pending', 'yes', 'no'])

// User-facing pt-BR copy: stays in Portuguese.
export const WHATSAPP_INVITE_TEMPLATE_DEFAULT =
  'Olá, {nome}! A Isabella vai fazer 15 anos e preparou um convite especial para você. Abra a carta: {link}'

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
  },
  (t) => [check('settings_single_row', sql`${t.id} = 1`)],
)

export type Guest = typeof guests.$inferSelect
export type NewGuest = typeof guests.$inferInsert
export type Settings = typeof settings.$inferSelect
export type RsvpStatus = (typeof rsvpStatus.enumValues)[number]
