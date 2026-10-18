// Version skew: a page loaded from the previous deployment calls a Server Action id the new server
// doesn't know. Next answers 409 + `x-nextjs-action-not-found: 1` and the client router throws an
// `UnrecognizedActionError`; the server-side variant ("Failed to find Server Action … older or newer
// deployment") can also reach the client as a plain Error. Both mean "reload to get the new build".

const SKEW_MESSAGE = /failed to find server action|was not found on the server|older or newer deployment|server action unavailable/i

export function isVersionSkewError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const { name, message } = error as { name?: unknown; message?: unknown }
  if (name === 'UnrecognizedActionError') return true
  return typeof message === 'string' && SKEW_MESSAGE.test(message)
}

/** What the browser shows while it reloads into the new deployment. */
export const SKEW_RELOAD_MESSAGE = 'O painel foi atualizado. Recarregando…'
export const SKEW_RELOAD_DELAY_MS = 1500
