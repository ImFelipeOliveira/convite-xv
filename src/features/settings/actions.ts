'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/features/admin-auth/guard'
import { logger } from '@/lib/logger'
import { getSettings, saveSettings } from './repo'
import { settingsFormSchema, todayInBoaVista } from './schema'

const FIELDS = ['rsvpDeadline', 'contactInfo', 'closingMessage', 'whatsappInviteTemplate'] as const
type Field = (typeof FIELDS)[number]

export type SettingsFormState =
  | { ok: true; message: string }
  | { ok: false; fieldErrors: Partial<Record<Field, string>>; values: Record<Field, string> }
  | null

function text(formData: FormData, name: string): string {
  const v = formData.get(name)
  return typeof v === 'string' ? v : ''
}

export async function saveSettingsAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const { adminId } = await requireAdmin()
  const values = Object.fromEntries(FIELDS.map((f) => [f, text(formData, f)])) as Record<Field, string>
  const parsed = settingsFormSchema(todayInBoaVista(), (await getSettings()).rsvpDeadline).safeParse(values)
  if (!parsed.success) {
    const fieldErrors: Partial<Record<Field, string>> = {}
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as Field
      fieldErrors[key] ??= issue.message
    }
    return { ok: false, fieldErrors, values }
  }
  await saveSettings(parsed.data)
  logger.info({ event: 'admin.settings_saved', adminId, fields: [...FIELDS] }, 'settings saved')
  revalidatePath('/admin/settings')
  return { ok: true, message: 'Configurações salvas.' }
}
