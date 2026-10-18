import type { RsvpResult } from './service'

type RsvpError = Extract<RsvpResult, { ok: false }>['error']

// User-facing pt-BR copy.
export function rsvpErrorMessage(error: RsvpError, limit?: number): string {
  switch (error) {
    case 'not_found':
      return 'Convite não encontrado.'
    case 'deadline_passed':
      return 'O prazo para responder terminou. Fale com a família pelo contato abaixo.'
    case 'over_limit':
      return `Seu convite inclui até ${limit ?? 0} acompanhantes.`
    case 'invalid_phone':
      return 'Telefone inválido. Use DDD + número.'
    case 'invalid':
      return 'Não conseguimos enviar agora. Sua resposta não foi perdida — toque em enviar de novo.'
  }
}
