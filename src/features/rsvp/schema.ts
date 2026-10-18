import { z } from 'zod'

export const rsvpSchema = z.object({
  token: z.string(),
  status: z.enum(['yes', 'no']),
  plusOnes: z.number().int().min(0).default(0),
  message: z.string().trim().max(500).optional(),
  phone: z.string().optional(),
})

export type RsvpInput = z.infer<typeof rsvpSchema>
