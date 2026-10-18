// Client-safe: shared by the invite service, its Server Action and the admin button.

export type SendInviteError =
  | 'not_configured'
  | 'not_connected'
  | 'no_phone'
  | 'not_found'
  | 'blocked'
  | 'invalid_number'
  | 'uncertain'
  | 'failed'

export type SendInviteResult = { ok: true; sentAt: string } | { ok: false; error: SendInviteError }

const MESSAGES: Record<SendInviteError, string> = {
  not_configured: 'WhatsApp não configurado.',
  not_connected: 'Conecte o WhatsApp na aba WhatsApp do painel.',
  no_phone: 'Cadastre o telefone do convidado.',
  not_found: 'Convidado não encontrado.',
  blocked: 'Envio em andamento. Aguarde um minuto.',
  invalid_number: 'Este número não tem WhatsApp.',
  uncertain:
    'O WhatsApp demorou a responder — a mensagem pode ter sido enviada. Confira no celular antes de reenviar.',
  failed: 'Não foi possível enviar agora. Tente de novo.',
}

/** pt-BR copy for a failed invite send. */
export function inviteErrorMessage(e: SendInviteError): string {
  return MESSAGES[e]
}
