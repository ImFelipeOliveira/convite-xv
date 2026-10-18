import { z } from 'zod'
import { normalizePhone } from './phone'

const LIMIT_ERROR = 'Limite deve ser de 0 a 6'

/** Admin guest form (also validates each imported CSV row). Phone comes out in E.164 or null. */
export const guestFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Nome obrigatório')
    .max(120, 'Nome deve ter até 120 caracteres'),
  phone: z
    .string()
    .trim()
    .optional()
    .transform((value, ctx) => {
      if (!value) return null
      const e164 = normalizePhone(value)
      if (!e164) {
        ctx.addIssue({ code: 'custom', message: 'Telefone inválido' })
        return z.NEVER
      }
      return e164
    }),
  plusOnesLimit: z.coerce
    .number({ error: LIMIT_ERROR })
    .int(LIMIT_ERROR)
    .min(0, LIMIT_ERROR)
    .max(6, LIMIT_ERROR),
})

export type GuestFormInput = z.input<typeof guestFormSchema>
export type GuestFormData = z.output<typeof guestFormSchema>
