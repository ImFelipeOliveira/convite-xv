import { sql } from 'drizzle-orm'
import { PIX_RECEIVER_NAME_DEFAULT } from '../../features/pix/defaults'
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

export const RSVP_NUDGE_TEXT_DEFAULT =
  'Oi, {nome}! Ainda não recebemos sua confirmação para os 15 anos da Isabella. Se puder, responda até {preferencia} pelo seu convite: {link}'
export const RSVP_FINAL_TEXT_DEFAULT =
  'Oi, {nome}! O prazo para confirmar presença nos 15 anos da Isabella termina em {prazo}. Responda pelo seu convite: {link}'

export const GIFT_LIST_TEXT_DEFAULT =
  'Oba, {nome}! Sua presença nos 15 anos da Isabella está confirmada. Se quiser presentear, a lista de presentes (com sugestões de onde comprar) e a opção de Pix estão no seu convite: {link}'
export const GIFT_NUDGE_TEXT_DEFAULT =
  'Oi, {nome}! Que bom que você vem aos 15 anos da Isabella. Se quiser presentear, a lista de presentes (com sugestões de onde comprar) e a opção de Pix estão no seu convite: {link} — Se você já escolheu um presente ou fez o Pix, pode ignorar esta mensagem.'

export const dispatchKind = pgEnum('dispatch_kind', [
  'invite',
  'reminder_d7',
  'reminder_d1',
  'rsvp_nudge',
  'rsvp_final',
  'gift_list',
  'gift_nudge',
])
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
    // Asaas customer for this guest; only used when ASAAS_REQUIRE_PAYER_CPF=true (the CPF itself is never stored)
    asaasCustomerId: text('asaas_customer_id'),
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
    rsvpPreferredDate: date('rsvp_preferred_date').default('2026-11-21'),
    rsvpNudgeText: text('rsvp_nudge_text').notNull().default(RSVP_NUDGE_TEXT_DEFAULT),
    rsvpFinalText: text('rsvp_final_text').notNull().default(RSVP_FINAL_TEXT_DEFAULT),
    giftListText: text('gift_list_text').notNull().default(GIFT_LIST_TEXT_DEFAULT),
    giftNudgeText: text('gift_nudge_text').notNull().default(GIFT_NUDGE_TEXT_DEFAULT),
    // generic Asaas customer ("Convidados — 15 anos da Isabella") used for every Pix charge
    asaasCustomerId: text('asaas_customer_id'),
    pixThanksMessage: text('pix_thanks_message'),
    // shown under the invite's QR ("{name} · Asaas") so guests can match the name their bank shows
    pixReceiverName: text('pix_receiver_name').default(PIX_RECEIVER_NAME_DEFAULT),
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

export const gifts = pgTable(
  'gifts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    category: text('category').notNull().default('Outros'),
    priceCents: integer('price_cents'),
    imageUrl: text('image_url'),
    // uploaded photo in object storage (gifts/<uuid>.webp); wins over image_url when both exist
    imageKey: text('image_key'),
    purchaseUrl: text('purchase_url'),
    sortOrder: integer('sort_order').notNull().default(0),
    guestId: uuid('guest_id').references(() => guests.id, { onDelete: 'set null' }),
    reservedAt: timestamp('reserved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('gifts_category_sort_order_idx').on(t.category, t.sortOrder),
    check('gifts_price_non_negative', sql`${t.priceCents} is null or ${t.priceCents} >= 0`),
  ],
)

export const pixStatus = pgEnum('pix_status', ['pending', 'paid', 'expired', 'cancelled', 'failed'])

export const pixPayments = pgTable(
  'pix_payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guestId: uuid('guest_id').references(() => guests.id, { onDelete: 'set null' }),
    amountCents: integer('amount_cents').notNull(),
    asaasPaymentId: text('asaas_payment_id').unique(),
    status: pixStatus('status').notNull().default('pending'),
    qrImage: text('qr_image'), // base64 PNG
    copyPaste: text('copy_paste'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    // a refund that arrived after the payment was paid (status stays `paid`; the admin sees "Estornado")
    refundedAt: timestamp('refunded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('pix_payments_amount_minimum', sql`${t.amountCents} >= 7000`),
    index('pix_payments_guest_status_idx').on(t.guestId, t.status),
  ],
)

export const webhookEvents = pgTable('webhook_events', {
  id: text('id').primaryKey(), // Asaas event id
  type: text('type').notNull(),
  paymentId: text('payment_id'),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
})

export type Guest = typeof guests.$inferSelect
export type NewGuest = typeof guests.$inferInsert
export type Settings = typeof settings.$inferSelect
export type RsvpStatus = (typeof rsvpStatus.enumValues)[number]
export type MessageDispatch = typeof messageDispatches.$inferSelect
export type DispatchKind = (typeof dispatchKind.enumValues)[number]
export type DispatchStatus = (typeof dispatchStatus.enumValues)[number]
export type Gift = typeof gifts.$inferSelect
export type NewGift = typeof gifts.$inferInsert
export type PixPayment = typeof pixPayments.$inferSelect
export type PixStatus = (typeof pixStatus.enumValues)[number]
export type WebhookEvent = typeof webhookEvents.$inferSelect
