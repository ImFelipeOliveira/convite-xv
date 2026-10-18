import { randomUUID } from 'node:crypto'
import { childLogger } from '@/lib/logger'
import type { Guest, PixPayment, PixStatus } from '@/server/db/schema'
import { afterPixPaid } from './after-paid'
import { createPixPayment, deletePayment, ensureCustomer, getPayment, getPixQrCode } from './asaas'
import { readAsaasConfig, requirePayerCpf, type AsaasConfig } from './config'
import { isValidCpf } from './cpf'
import { pixDueDate } from './due-date'
import { PIX_MAX_CENTS, PIX_MIN_CENTS } from './limits'
import {
  findGuestPayment,
  findGuestPixState,
  findReusablePending,
  getGenericCustomerId,
  getGuestCustomerId,
  insertPendingPayment,
  saveGenericCustomerId,
  saveGuestCustomerId,
  settlePendingPayment,
  withAdvisoryLock,
  type Executor,
} from './repo'

const log = childLogger({ module: 'pix' })

export { PIX_MAX_CENTS, PIX_MIN_CENTS }
// pt-BR: shown to the payer in Asaas / their bank app
export const GENERIC_CUSTOMER_NAME = 'Convidados — 15 anos da Isabella'
const PAYMENT_DESCRIPTION = 'Presente Pix — 15 anos da Isabella'
const POLL_AFTER_MS = 2 * 60_000
const POLL_EVERY_MS = 30_000
/** Concurrent generations per app instance (each holds a pooled connection while Asaas answers). */
const MAX_CONCURRENT = 4
/** How long a generation over the limit waits for a free slot before answering `busy`. */
const SLOT_WAIT_MS = 3_000
const GENERIC_CUSTOMER_LOCK = 'pix:generic-customer'

export type PixView = {
  id: string
  amountCents: number
  status: PixStatus
  qrImage: string | null
  copyPaste: string | null
  expiresAt: string | null
  paidAt: string | null
}

export type PixError =
  | 'below_minimum'
  | 'above_maximum'
  | 'not_configured'
  | 'unavailable'
  | 'cpf_required'
  | 'invalid_cpf'
  /** too many generations at once: try again in a few seconds */
  | 'busy'

export type PixDeps = {
  /** undefined = read from env; null = not configured */
  config?: AsaasConfig | null
  fetch?: typeof fetch
  now?: () => Date
  /** undefined = read from env (ASAAS_REQUIRE_PAYER_CPF) */
  requireCpf?: boolean
  /** how long to wait for a free generation slot (default 3 s) */
  slotWaitMs?: number
  /** runs once when the status poll turns a payment paid (default afterPixPaid) */
  afterPaid?: (guestId: string) => Promise<void>
}

/** Non-negative integer ms from env, or the default (lets e2e poll Asaas right away). */
function envMs(name: string, fallback: number): number {
  const raw = process.env[name]?.trim()
  if (!raw || !/^\d+$/.test(raw)) return fallback
  return Number(raw)
}

// In-process semaphore: at most MAX_CONCURRENT generatePix flows at once (single app instance).
let activeSlots = 0
const slotWaiters: (() => void)[] = []

function acquireSlot(waitMs: number): Promise<boolean> {
  if (activeSlots < MAX_CONCURRENT) {
    activeSlots += 1
    return Promise.resolve(true)
  }
  return new Promise((resolveSlot) => {
    const take = () => {
      clearTimeout(timer)
      activeSlots += 1
      resolveSlot(true)
    }
    const timer = setTimeout(() => {
      const i = slotWaiters.indexOf(take)
      if (i >= 0) slotWaiters.splice(i, 1)
      resolveSlot(false)
    }, waitMs)
    slotWaiters.push(take)
  })
}

function releaseSlot(): void {
  activeSlots -= 1
  slotWaiters.shift()?.()
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
  tx: Executor,
): Promise<string | null> {
  if (cpf) {
    // already under this guest's lock
    const existing = await getGuestCustomerId(guest.id, tx)
    if (existing) return existing
    const created = await ensureCustomer(config, { name: guest.name, cpfCnpj: cpf }, fetchImpl)
    if (!created.ok) {
      log.warn({ guestId: guest.id, code: created.error }, 'pix customer failed')
      return null
    }
    await saveGuestCustomerId(guest.id, created.value.id, tx)
    return created.value.id
  }
  const cached = await getGenericCustomerId(tx)
  if (cached) return cached
  // first charge ever: one creator at a time (the lock lasts until the caller's transaction ends)
  return withAdvisoryLock(
    GENERIC_CUSTOMER_LOCK,
    async (sp) => {
      const existing = await getGenericCustomerId(sp)
      if (existing) return existing
      const created = await ensureCustomer(config, { name: GENERIC_CUSTOMER_NAME }, fetchImpl)
      if (!created.ok) {
        log.warn({ code: created.error }, 'pix generic customer failed')
        return null
      }
      await saveGenericCustomerId(created.value.id, sp)
      return created.value.id
    },
    tx,
  )
}

/**
 * Creates (or reuses) a Pix charge for a guest. Our row is written only after Asaas answered with a
 * payment id and its QR code, so a failure never leaves an orphan row; if anything fails after the
 * charge exists, the charge is deleted at Asaas (best effort). Runs under a per-guest advisory lock, so
 * a double submit gets the same charge. Never throws: Asaas and infrastructure failures answer
 * `unavailable`; at most 4 run at once per instance (the excess waits up to 3 s, then `busy`). The CPF
 * (payer-CPF mode) goes to Asaas only: never stored, never logged.
 */
export async function generatePix(
  guest: Pick<Guest, 'id' | 'name'>,
  amountCents: number,
  deps: PixDeps = {},
  payer: { cpf?: string | null } = {},
): Promise<PixResult> {
  if (!Number.isSafeInteger(amountCents) || amountCents < PIX_MIN_CENTS) {
    return { ok: false, error: 'below_minimum' }
  }
  if (amountCents > PIX_MAX_CENTS) return { ok: false, error: 'above_maximum' }
  const resolved = resolve(deps)
  const config = resolved.config
  if (!config) return { ok: false, error: 'not_configured' }
  if (!(await acquireSlot(deps.slotWaitMs ?? SLOT_WAIT_MS))) {
    log.warn({ guestId: guest.id, code: 'busy' }, 'pix generation over the concurrency limit')
    return { ok: false, error: 'busy' }
  }
  try {
    // one check-then-create per guest at a time: a double submit gets the same charge
    return await withAdvisoryLock(`pix:guest:${guest.id}`, (tx) =>
      createOrReuse(guest, amountCents, payer, { ...resolved, config }, tx),
    )
  } catch (err) {
    // infrastructure failures (pool, lock timeout, commit): never a throw to the caller
    log.error({ guestId: guest.id, err }, 'pix generation failed')
    return { ok: false, error: 'unavailable' }
  } finally {
    releaseSlot()
  }
}

type PixResult = { ok: true; payment: PixView } | { ok: false; error: PixError }

async function createOrReuse(
  guest: Pick<Guest, 'id' | 'name'>,
  amountCents: number,
  payer: { cpf?: string | null },
  { config, fetchImpl, now, requireCpf }: ReturnType<typeof resolve> & { config: AsaasConfig },
  tx: Executor,
): Promise<PixResult> {
  const at = now()
  // before the CPF check: a guest with a valid QR for this amount sees it without retyping the CPF
  const reusable = await findReusablePending(guest.id, amountCents, at, tx)
  if (reusable) return { ok: true, payment: toPixView(reusable) }

  let cpf: string | null = null
  if (requireCpf) {
    const raw = payer.cpf?.trim() ?? ''
    if (!raw) return { ok: false, error: 'cpf_required' }
    if (!isValidCpf(raw)) return { ok: false, error: 'invalid_cpf' }
    cpf = raw.replace(/\D/g, '')
  }

  const customerId = await customerFor(guest, cpf, config, fetchImpl, tx)
  if (!customerId) return { ok: false, error: 'unavailable' }

  const id = randomUUID()
  const charge = await createPixPayment(
    config,
    {
      customerId,
      valueCents: amountCents,
      dueDate: pixDueDate(at),
      externalReference: id,
      description: PAYMENT_DESCRIPTION,
    },
    fetchImpl,
  )
  if (!charge.ok) {
    log.warn({ paymentId: id, code: charge.error }, 'pix charge failed')
    return { ok: false, error: 'unavailable' }
  }
  const asaasPaymentId = charge.value.id

  // best effort: never leave a payable charge at Asaas that we have no row for
  const discard = async (stage: string, code: string) => {
    log.warn({ paymentId: id, asaasPaymentId, code }, `pix ${stage} failed`)
    const removed = await deletePayment(config, asaasPaymentId, fetchImpl)
    if (!removed.ok) log.warn({ asaasPaymentId, code: removed.error }, 'pix charge cleanup failed')
    return { ok: false as const, error: 'unavailable' as const }
  }

  const qr = await getPixQrCode(config, asaasPaymentId, fetchImpl)
  if (!qr.ok) return discard('qr', qr.error)

  let row: PixPayment
  try {
    row = await insertPendingPayment(
      {
        id,
        guestId: guest.id,
        amountCents,
        asaasPaymentId,
        qrImage: qr.value.encodedImage,
        copyPaste: qr.value.payload,
        expiresAt: parseAsaasDateTime(qr.value.expirationDate),
        now: at,
      },
      tx,
    )
  } catch {
    return discard('save', 'db_error')
  }
  log.info({ paymentId: row.id, asaasPaymentId }, 'pix charge created')
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
 * 2 min after creation, asks Asaas directly at most once per 30 s per payment (both overridable with
 * PIX_POLL_AFTER_MS / PIX_POLL_EVERY_MS, used by e2e where no webhook arrives).
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
  if (!config || at - row.createdAt.getTime() < envMs('PIX_POLL_AFTER_MS', POLL_AFTER_MS)) return toPixView(row)
  const last = lastPolledAt.get(row.id)
  if (last !== undefined && at - last < envMs('PIX_POLL_EVERY_MS', POLL_EVERY_MS)) return toPixView(row)
  lastPolledAt.set(row.id, at)

  const remote = await getPayment(config, row.asaasPaymentId, fetchImpl)
  if (!remote.ok) {
    log.warn({ paymentId: row.id, code: remote.error }, 'pix status poll failed')
    return toPixView(row)
  }
  if (remote.value.status === 'pending') return toPixView(row)
  if (remote.value.status === 'paid' && remote.value.valueCents !== row.amountCents) {
    // never trust a paid status for another amount: the webhook (or the admin in Asaas) decides
    log.warn({ paymentId: row.id, code: 'value_mismatch' }, 'pix status poll not trusted')
    return toPixView(row)
  }
  // conditional on still pending: when the webhook settled it meanwhile, this writes nothing
  const settled = await settlePendingPayment(row.id, remote.value.status, new Date(at))
  if (settled) {
    lastPolledAt.delete(row.id)
    log.info({ paymentId: row.id, status: settled.status }, 'pix status from poll')
    if (settled.status === 'paid' && settled.guestId) {
      // only this transition runs the hook (the webhook runs it when it wins instead)
      try {
        await (deps.afterPaid ?? afterPixPaid)(settled.guestId)
      } catch (err) {
        log.error({ paymentId: settled.id, guestId: settled.guestId, err }, 'pix after-paid hook failed')
      }
    }
    return toPixView(settled)
  }
  // a webhook settled it meanwhile
  const fresh = await findGuestPayment(guestId, paymentId)
  return fresh ? toPixView(fresh) : null
}

/**
 * For the invite on load: the charge to show (newest paid, or still payable pending) and the amount of
 * the guest's newest paid Pix (so the RSVP screen thanks for it).
 */
export async function getGuestPixState(
  guestId: string,
  now: Date = new Date(),
): Promise<{ current: PixView | null; paidCents: number | null }> {
  const { current, paid } = await findGuestPixState(guestId, now)
  return { current: current ? toPixView(current) : null, paidCents: paid?.amountCents ?? null }
}
