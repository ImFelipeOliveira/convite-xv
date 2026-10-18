// Client-safe pt-BR labels for the dispatch history (admin WhatsApp page).
import type { DispatchKind, DispatchStatus } from '@/server/db/schema'

export const DISPATCH_KIND_LABEL: Record<DispatchKind, string> = {
  invite: 'Convite',
  reminder_d7: 'Lembrete 7 dias',
  reminder_d1: 'Lembrete véspera',
}

export const DISPATCH_STATUS_LABEL: Record<DispatchStatus, string> = {
  scheduled: 'Agendado',
  sending: 'Enviando',
  sent: 'Enviado',
  failed: 'Falhou',
  cancelled: 'Cancelado',
}

const ERROR_LABEL: Record<string, string> = {
  not_configured: 'WhatsApp não configurado',
  not_connected: 'WhatsApp desconectado',
  invalid_number: 'Número sem WhatsApp',
  timeout: 'Sem resposta do WhatsApp',
  unauthorized: 'Chave de acesso recusada',
  provider_error: 'Erro no servidor do WhatsApp',
  internal_error: 'Erro interno',
  interrupted: 'Envio interrompido',
  no_phone: 'Convidado sem telefone',
}

/** pt-BR label of a stored `errorCode` (unknown codes get a generic label, never the raw code). */
export function dispatchErrorLabel(code: string | null | undefined): string | null {
  if (!code) return null
  return Object.hasOwn(ERROR_LABEL, code) ? ERROR_LABEL[code] : 'Erro no envio'
}

export function isDispatchKind(v: unknown): v is DispatchKind {
  return typeof v === 'string' && Object.hasOwn(DISPATCH_KIND_LABEL, v)
}

export function isDispatchStatus(v: unknown): v is DispatchStatus {
  return typeof v === 'string' && Object.hasOwn(DISPATCH_STATUS_LABEL, v)
}
