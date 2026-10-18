'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdmin } from '@/features/admin-auth/guard'
import { sendInvite } from './invite'
import type { SendInviteResult } from './invite-result'

const idSchema = z.uuid()

/** Sends one invite from the guests list (form field `guestId`). */
export async function sendInviteAction(
  _prev: SendInviteResult | null,
  formData: FormData,
): Promise<SendInviteResult> {
  const { adminId } = await requireAdmin()
  const parsed = idSchema.safeParse(formData.get('guestId'))
  if (!parsed.success) return { ok: false, error: 'not_found' }
  const result = await sendInvite(parsed.data, adminId)
  revalidatePath('/admin/guests')
  return result
}
