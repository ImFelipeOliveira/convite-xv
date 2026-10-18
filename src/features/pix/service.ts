import { randomUUID } from 'node:crypto'
import { todayInBoaVista } from '@/features/settings/schema'
import { childLogger } from '@/lib/logger'
import type { Guest, PixPayment, PixStatus } from '@/server/db/schema'
import { createPixPayment, deletePayment, ensureCustomer, getPayment, getPixQrCode } from './asaas'
import { readAsaasConfig, requirePayerCpf, type AsaasConfig } from './config'
import { isValidCpf } from './cpf'
import {
  findGuestPayment,
  findReusablePending,
  getGenericCustomerId,
  getGuestCustomerId,
  insertPendingPayment,
  saveGenericCustomerId,
  saveGuestCustomerId,
  settlePendingPayment,
} from './repo'

const log = childLogger({ module: 'pix' })

export const PIX_MIN_CENTS = 7000
// pt-BR: shown to the payer in Asaas / their bank app
export const GENERIC_CUSTOMER_NAME = 'Convidados — 15 anos da Isabella'
const PAYMENT_DESCRIPTION = 'Presente Pix — 15 anos da Isabella'
const POLL_AFTER_MS = 2 * 60_000
const POLL_EVERY_MS = 30_000

export type PixView = {
  id: string
  amountCents: number
  status: PixStatus
  qrImage: string | null
  copyPaste: string | null
  expiresAt: string | null
  paidAt: string | null
}

export type PixError = 'below_minimum' | 'not_configured' | 'unavailable' | 'cpf_required' | 'invalid_cpf'

export type PixDeps = {
  /** undefined = read from env; null = not configured */
  config?: AsaasConfig | null
  fetch?: typeof fetch
  now?: () => Date
  /** undefined = read from env (ASAAS_REQUIRE_PAYER_CPF) */
  requireCpf?: boolean
}

function resolve(deps: PixDeps) {
  return {
    config: deps.config === undefined ? readAsaasConfig() : deps.config,
    fetchImpl: deps.fetch ?? fetch,
    now: deps.now ?? (() => new Date()),
    requireCpf: deps.requireCpf ?? requirePayerCpf(),
  }
}

export function toPixView(row: PixPayment): PixView {
  return {
    id: row.id,
    amountCents: row.amountCents,
    status: row.status,
    qrImage: row.qrImage,
    copyPaste: row.copyPaste,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    paidAt: row.paidAt?.toISOString() ?? null,
  }
}

/**
 * Asaas `expirationDate` ('YYYY-MM-DD HH:mm:ss', Brasília time, UTC−3, no DST) → Date.
 * Values carrying their own offset are parsed as-is; anything unparseable → null.
 */
export function parseAsaasDateTime(value: string | null): Date | null {
  if (!value) return null
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/.exec(value.trim())
  if (!m) return null
  const d = new Date(`${m[1]}T${m[2]}${m[3] ?? ''}${m[4] ?? '-03:00'}`)
  return Number.isNaN(d.getTime()) ? null : d
}

async function customerFor(
  guest: Pick<Guest, 'id' | 'name'>,
  cpf: string | null,
  config: AsaasConfig,
  fetchImpl: typeof fetch,
): Promise<string | null> {
  if (cpf) {
    const existing = await getGuestCustomerId(guest.id)
    if (existing) return existing
    const created = await ensureCustomer(config, { name: guest.name, cpfCnpj: cpf }, fetchImpl)
    if (!created.ok) {
      log.warn({ guestId: guest.id, code: created.error }, 'pix customer failed')
      return null
    }
    await saveGuestCustomerId(guest.id, created.value.id)
    return created.value.id
  }
  const existing = await getGenericCustomerId()
  if (existing) return existing
  const created = await ensureCustomer(config, { name: GENERIC_CUSTOMER_NAME }, fetchImpl)
  if (!created.ok) {
    log.warn({ code: created.error }, 'pix generic customer failed')
    return null
  }
  await saveGenericCustomerId(created.value.id)
  return created.value.id
}

/**
 * Creates (or reuses) a Pix charge for a guest. Our row is written only after Asaas answered with a
 * payment id and its QR code, so a failure never leaves an orphan row. The CPF (payer-CPF mode) goes
 * to Asaas only: never stored, never logged.
 */
export async function generatePix(
  guest: Pick<Guest, 'id' | 'name'>,
  amountCents: number,
  deps: PixDeps = {},
  payer: { cpf?: string | null } = {},
): Promise<{ ok: true; payment: PixView } | { ok: false; error: PixError }> {
  if (!Number.isSafeInteger(amountCents) || amountCents < PIX_MIN_CENTS) {
    return { ok: false, error: 'below_minimum' }
  }
  const { config, fetchImpl, now, requireCpf } = resolve(deps)
  if (!config) return { ok: false, error: 'not_configured' }

  let cpf: string | null = null
  if (requireCpf) {
    const raw = payer.cpf?.trim() ?? ''
    if (!raw) return { ok: false, error: 'cpf_required' }
    if (!isValidCpf(raw)) return { ok: false, error: 'invalid_cpf' }
    cpf = raw.replace(/\D/g, '')
  }

  const at = now()
  const reusable = await findReusablePending(guest.id, amountCents, at)
  if (reusable) return { ok: true, payment: toPixView(reusable) }

  const customerId = await customerFor(guest, cpf, config, fetchImpl)
  if (!customerId) return { ok: false, error: 'unavailable' }

  const id = randomUUID()
  const charge = await createPixPayment(
    config,
    {
      customerId,
      valueCents: amountCents,
      dueDate: todayInBoaVista(at),
      externalReference: id,
      description: PAYMENT_DESCRIPTION,
    },
    fetchImpl,
  )
  if (!charge.ok) {
    log.warn({ paymentId: id, code: charge.error }, 'pix charge failed')
    return { ok: false, error: 'unavailable' }
  }

  const qr = await getPixQrCode(config, charge.value.id, fetchImpl)
  if (!qr.ok) {
    log.warn({ paymentId: id, asaasPaymentId: charge.value.id, code: qr.error }, 'pix qr failed')
    // best effort: do not leave a payable charge at Asaas that we have no row for
    const removed = await deletePayment(config, charge.value.id, fetchImpl)
    if (!removed.ok) {
      log.warn({ asaasPaymentId: charge.value.id, code: removed.error }, 'pix charge cleanup failed')
    }
    return { ok: false, error: 'unavailable' }
  }

  const row = await insertPendingPayment({
    id,
    guestId: guest.id,
    amountCents,
    asaasPaymentId: charge.value.id,
    qrImage: qr.value.encodedImage,
    copyPaste: qr.value.payload,
    expiresAt: parseAsaasDateTime(qr.value.expirationDate),
    now: at,
  })
  log.info({ paymentId: row.id, asaasPaymentId: row.asaasPaymentId }, 'pix charge created')
  return { ok: true, payment: toPixView(row) }
}

// In-process throttle for the status fallback poll (single app instance); keyed by our payment id.
const lastPolledAt = new Map<string, number>()

/** Test helper: forgets the poll throttle. */
export function resetPollClock(): void {
  lastPolledAt.clear()
}

/**
 * The guest's payment as stored (the webhook is the source of truth). While still `pending` more than
 * 2 min after creation, asks Asaas directly at most once per 30 s per payment.
 */
export async function getPixStatus(
  guestId: string,
  paymentId: string,
  deps: PixDeps = {},
): Promise<PixView | null> {
  const row = await findGuestPayment(guestId, paymentId)
  if (!row) return null
  if (row.status !== 'pending' || !row.asaasPaymentId) return toPixView(row)

  const { config, fetchImpl, now } = resolve(deps)
  const at = now().getTime()
  if (!config || at - row.createdAt.getTime() < POLL_AFTER_MS) return toPixView(row)
  const last = lastPolledAt.get(row.id)
  if (last !== undefined && at - last < POLL_EVERY_MS) return toPixView(row)
  lastPolledAt.set(row.id, at)

  const remote = await getPayment(config, row.asaasPaymentId, fetchImpl)
  if (!remote.ok) {
    log.warn({ paymentId: row.id, code: remote.error }, 'pix status poll failed')
    return toPixView(row)
  }
  if (remote.value.status === 'pending') return toPixView(row)
  const settled = await settlePendingPayment(row.id, remote.value.status, new Date(at))
  if (settled) {
    lastPolledAt.delete(row.id)
    log.info({ paymentId: row.id, status: settled.status }, 'pix status from poll')
    return toPixView(settled)
  }
  // a webhook settled it meanwhile
  const fresh = await findGuestPayment(guestId, paymentId)
  return fresh ? toPixView(fresh) : null
}
