'use server'

import { submitRsvp, type RsvpResult } from './service'

function field(formData: FormData, name: string): string | undefined {
  const v = formData.get(name)
  return typeof v === 'string' ? v : undefined
}

export async function submitRsvpAction(
  _prev: RsvpResult | null,
  formData: FormData,
): Promise<RsvpResult> {
  const plusOnesRaw = field(formData, 'plusOnes')
  return submitRsvp({
    token: field(formData, 'token') ?? '',
    status: field(formData, 'status'),
    plusOnes: plusOnesRaw === undefined || plusOnesRaw === '' ? undefined : Number(plusOnesRaw),
    message: field(formData, 'message'),
    phone: field(formData, 'phone'),
  })
}
