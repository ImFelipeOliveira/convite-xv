import { readEvolutionConfig } from './config'
import type { ConnectResult, DisconnectResult, StatusResult, WhatsappState } from './connection-result'
import { connectQr, fetchQr, getConnectionState, logout, type EvolutionError } from './evolution'

export type ConnectionDeps = {
  readEvolutionConfig: typeof readEvolutionConfig
  getConnectionState: typeof getConnectionState
  connectQr: typeof connectQr
  fetchQr: typeof fetchQr
  logout: typeof logout
  sleep: (ms: number) => Promise<void>
}

const defaultDeps: ConnectionDeps = {
  readEvolutionConfig,
  getConnectionState,
  connectQr,
  fetchQr,
  logout,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
}

/** Evolution may take a moment to produce the first QR after creating/restarting the session. */
const QR_RETRIES = 3
const QR_RETRY_MS = 1500

export async function readStatus(deps: ConnectionDeps = defaultDeps): Promise<WhatsappState> {
  const cfg = deps.readEvolutionConfig()
  if (!cfg) return 'not_configured'
  const r = await deps.getConnectionState(cfg)
  return r.ok ? r.value : 'unavailable'
}

function toConnectError(e: EvolutionError) {
  if (e === 'unauthorized' || e === 'not_configured') return e
  return 'unavailable' as const
}

/** Creates the instance if needed and returns the QR to scan (or `open` when already connected). */
export async function startConnect(deps: ConnectionDeps = defaultDeps): Promise<ConnectResult> {
  const cfg = deps.readEvolutionConfig()
  if (!cfg) return { ok: false, error: 'not_configured' }
  const first = await deps.connectQr(cfg)
  if (!first.ok) return { ok: false, error: toConnectError(first.error) }
  if (first.value.qrDataUrl) return { ok: true, state: 'connecting', qrDataUrl: first.value.qrDataUrl }

  const state = await deps.getConnectionState(cfg)
  if (state.ok && state.value === 'open') return { ok: true, state: 'open' }
  for (let i = 0; i < QR_RETRIES; i++) {
    await deps.sleep(QR_RETRY_MS)
    const again = await deps.fetchQr(cfg)
    if (!again.ok) return { ok: false, error: toConnectError(again.error) }
    if (again.value.qrDataUrl) return { ok: true, state: 'connecting', qrDataUrl: again.value.qrDataUrl }
  }
  const last = await deps.getConnectionState(cfg)
  if (last.ok && last.value === 'open') return { ok: true, state: 'open' }
  return { ok: false, error: 'qr_unavailable' }
}

/** Status for the polling card; with `refreshQr`, also the current QR while still pairing. */
export async function pollStatus(refreshQr: boolean, deps: ConnectionDeps = defaultDeps): Promise<StatusResult> {
  const state = await readStatus(deps)
  if (!refreshQr || state !== 'connecting') return { state }
  const cfg = deps.readEvolutionConfig()
  if (!cfg) return { state }
  const qr = await deps.fetchQr(cfg)
  return qr.ok && qr.value.qrDataUrl ? { state, qrDataUrl: qr.value.qrDataUrl } : { state }
}

/** Logs the number out; a failed logout still counts when the number ends up closed. */
export async function disconnect(deps: ConnectionDeps = defaultDeps): Promise<DisconnectResult> {
  const cfg = deps.readEvolutionConfig()
  if (!cfg) return { ok: false, error: 'not_configured' }
  const r = await deps.logout(cfg)
  if (r.ok) return { ok: true }
  const state = await deps.getConnectionState(cfg)
  return state.ok && state.value === 'close' ? { ok: true } : { ok: false, error: 'unavailable' }
}
