// Reload cap for version skew recovery: if the server keeps rejecting actions right after reloading
// (a broken deploy, a proxy serving mixed builds), stop reloading in a loop and tell the admin instead.
// The count survives the reloads in sessionStorage; a successful action resets it.
import { sessionStore, type StorageLike } from './form-draft'

export type SkewReloadLog = { count: number; firstAt: number }

export const SKEW_RELOADS_KEY = 'xv:skew-reloads'
export const SKEW_RELOAD_WINDOW_MS = 60_000
export const SKEW_MAX_RELOADS = 2
export const SKEW_RELOAD_BLOCKED_MESSAGE = 'Não foi possível atualizar o painel. Recarregue a página em instantes.'

/** Pure decision: at most SKEW_MAX_RELOADS reloads within SKEW_RELOAD_WINDOW_MS. */
export function decideSkewReload(log: SkewReloadLog | null, now: number): { allow: boolean; log: SkewReloadLog } {
  const live = log && now - log.firstAt < SKEW_RELOAD_WINDOW_MS && now >= log.firstAt ? log : null
  if (!live) return { allow: true, log: { count: 1, firstAt: now } }
  if (live.count >= SKEW_MAX_RELOADS) return { allow: false, log: live }
  return { allow: true, log: { count: live.count + 1, firstAt: live.firstAt } }
}

function readLog(store: StorageLike): SkewReloadLog | null {
  try {
    const raw = store.getItem(SKEW_RELOADS_KEY)
    if (!raw) return null
    const log = JSON.parse(raw) as Partial<SkewReloadLog>
    return typeof log.count === 'number' && typeof log.firstAt === 'number'
      ? { count: log.count, firstAt: log.firstAt }
      : null
  } catch {
    return null
  }
}

/**
 * Records a reload if one is still allowed. Without storage the reload is allowed (it can't be
 * counted; a loop then needs a server that keeps rejecting fresh pages, which a deploy doesn't cause).
 */
export function claimSkewReload(store = sessionStore(), now = Date.now()): boolean {
  if (!store) return true
  const decision = decideSkewReload(readLog(store), now)
  if (decision.allow) {
    try {
      store.setItem(SKEW_RELOADS_KEY, JSON.stringify(decision.log))
    } catch {
      // can't count: still reload
    }
  }
  return decision.allow
}

/** A Server Action went through: the panel and the server agree again. */
export function resetSkewReloads(store = sessionStore()) {
  try {
    if (store?.getItem(SKEW_RELOADS_KEY) !== null) store?.removeItem(SKEW_RELOADS_KEY)
  } catch {
    // storage unavailable
  }
}
