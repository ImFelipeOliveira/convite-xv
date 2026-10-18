// Client-safe: shared by the connection service, its Server Actions and the admin status card.

/** Connection as the admin sees it: provider states plus "no env" and "provider unreachable". */
export type WhatsappState = 'open' | 'connecting' | 'close' | 'not_configured' | 'unavailable'

export type ConnectError = 'not_configured' | 'unauthorized' | 'unavailable' | 'qr_unavailable'

export type ConnectResult =
  | { ok: true; state: 'open' }
  | { ok: true; state: 'connecting'; qrDataUrl: string }
  | { ok: false; error: ConnectError }

export type StatusResult = { state: WhatsappState; qrDataUrl?: string }

export type DisconnectResult = { ok: true } | { ok: false; error: 'not_configured' | 'unavailable' }

export type RetryDispatchResult = { ok: true } | { ok: false; error: 'not_retryable' }

const CONNECT_MESSAGES: Record<ConnectError, string> = {
  not_configured: 'WhatsApp não configurado.',
  unauthorized: 'O servidor do WhatsApp recusou a chave de acesso. Fale com o Felipe.',
  unavailable: 'Não foi possível falar com o servidor do WhatsApp. Tente de novo.',
  qr_unavailable: 'O QR Code ainda não ficou pronto. Tente de novo em alguns segundos.',
}

export function connectErrorMessage(e: ConnectError): string {
  return CONNECT_MESSAGES[e]
}
