'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/features/admin-auth/guard'
import { isMusicKey } from '@/features/media/keys'
import { getStorage } from '@/features/media/storage'
import { logger } from '@/lib/logger'
import { getSettings, saveSettings } from './repo'
import { settingsFormSchema, todayInBoaVista } from './schema'

const FIELDS = [
  'rsvpDeadline',
  'contactInfo',
  'closingMessage',
  'whatsappInviteTemplate',
  'reminderD7Text',
  'reminderD1Text',
  'rsvpPreferredDate',
  'rsvpNudgeText',
  'rsvpFinalText',
  'giftListText',
  'giftNudgeText',
  'pixThanksMessage',
  'pixReceiverName',
  'musicKey',
  'musicStartSeconds',
] as const
type Field = (typeof FIELDS)[number]

export type SettingsFormState =
  | { ok: true; message: string }
  | { ok: false; fieldErrors: Partial<Record<Field, string>>; values: Record<Field, string> }
  | null

function text(formData: FormData, name: string): string {
  const v = formData.get(name)
  return typeof v === 'string' ? v : ''
}

/** Best effort: the replaced or removed music file only costs storage, so a failure is logged and ignored. */
async function deleteMusic(key: string, adminId: string) {
  if (!isMusicKey(key)) return
  try {
    await getStorage().delete(key)
    logger.info({ event: 'admin.music_deleted', adminId, key }, 'music deleted')
  } catch (err) {
    logger.warn({ event: 'admin.music_delete_failed', adminId, key, err }, 'music delete failed')
  }
}

export async function saveSettingsAction(
  _prev: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const { adminId } = await requireAdmin()
  const stored = await getSettings()
  const values = Object.fromEntries(FIELDS.map((f) => [f, text(formData, f)])) as Record<Field, string>
  // a form without the music fields (a panel from before they existed) keeps the saved music untouched
  if (!formData.has('musicKey')) values.musicKey = stored.musicKey ?? ''
  if (!formData.has('musicStartSeconds')) values.musicStartSeconds = String(stored.musicStartSeconds)
  const parsed = settingsFormSchema(todayInBoaVista(), stored.rsvpDeadline, stored.rsvpPreferredDate).safeParse(values)
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
  if (stored.musicKey && stored.musicKey !== parsed.data.musicKey) await deleteMusic(stored.musicKey, adminId)
  revalidatePath('/admin/settings')
  return { ok: true, message: 'Configurações salvas.' }
}
