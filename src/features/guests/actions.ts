'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireAdmin } from '@/features/admin-auth/guard'
import { logger } from '@/lib/logger'
import { parseGuestsCsv } from './csv'
import type { CsvLineError } from './import-report'
import { createGuest, deleteGuest, updateGuest } from './repo'
import { guestFormSchema } from './schema'

const GUESTS_PATH = '/admin/guests'
const MAX_IMPORT_BYTES = 1024 * 1024
const MAX_IMPORT_ROWS = 1000

type GuestField = 'name' | 'phone' | 'plusOnesLimit'

export type GuestFormState =
  | { ok: true; message: string }
  | {
      ok: false
      error?: string
      fieldErrors?: Partial<Record<GuestField, string>>
      values?: Record<GuestField, string>
    }
  | null

export type ImportGuestsState = {
  imported: number
  errors: CsvLineError[]
  /** File-level problem (missing, too big, too many rows): nothing was imported. */
  error?: string
} | null

function text(formData: FormData, name: string): string {
  const v = formData.get(name)
  return typeof v === 'string' ? v : ''
}

const idSchema = z.uuid()

/** Creates a guest, or updates one when the form carries an `id` (then redirects to the list). */
export async function saveGuestAction(
  _prev: GuestFormState,
  formData: FormData,
): Promise<GuestFormState> {
  const { adminId } = await requireAdmin()
  const id = text(formData, 'id')
  const values = {
    name: text(formData, 'name'),
    phone: text(formData, 'phone'),
    plusOnesLimit: text(formData, 'plusOnesLimit'),
  }
  if (id && !idSchema.safeParse(id).success) return { ok: false, error: 'Convidado não encontrado.', values }
  const parsed = guestFormSchema.safeParse({ ...values, plusOnesLimit: values.plusOnesLimit || '0' })
  if (!parsed.success) {
    const fieldErrors: Partial<Record<GuestField, string>> = {}
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as GuestField
      fieldErrors[key] ??= issue.message
    }
    return { ok: false, fieldErrors, values }
  }

  if (!id) {
    const guest = await createGuest(parsed.data)
    logger.info({ event: 'admin.guest_created', guestId: guest.id, adminId }, 'guest created')
    revalidatePath(GUESTS_PATH)
    return { ok: true, message: 'Convidado adicionado.' }
  }

  const guest = await updateGuest(id, parsed.data)
  if (!guest) return { ok: false, error: 'Convidado não encontrado.', values }
  logger.info({ event: 'admin.guest_updated', guestId: guest.id, adminId }, 'guest updated')
  revalidatePath(GUESTS_PATH)
  redirect(GUESTS_PATH)
}

export async function deleteGuestAction(id: string): Promise<{ ok: boolean }> {
  const { adminId } = await requireAdmin()
  if (!idSchema.safeParse(id).success) return { ok: false }
  await deleteGuest(id)
  logger.info({ event: 'admin.guest_deleted', guestId: id, adminId }, 'guest deleted')
  revalidatePath(GUESTS_PATH)
  return { ok: true }
}

/** Imports the valid rows of an uploaded CSV; invalid rows are reported by line and skipped. */
export async function importGuestsAction(
  _prev: ImportGuestsState,
  formData: FormData,
): Promise<ImportGuestsState> {
  const { adminId } = await requireAdmin()
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { imported: 0, errors: [], error: 'Selecione um arquivo CSV.' }
  }
  if (file.size > MAX_IMPORT_BYTES) {
    return { imported: 0, errors: [], error: 'O arquivo deve ter no máximo 1 MB.' }
  }
  const { valid, errors } = parseGuestsCsv(await file.text())
  if (valid.length + errors.length > MAX_IMPORT_ROWS) {
    return {
      imported: 0,
      errors: [],
      error: `O arquivo deve ter no máximo ${MAX_IMPORT_ROWS} convidados. Divida em arquivos menores.`,
    }
  }

  let imported = 0
  try {
    for (const row of valid) {
      await createGuest(row)
      imported++
    }
  } catch (err) {
    logger.error({ event: 'admin.guests_import_failed', imported, adminId, err }, 'guest import failed')
    revalidatePath(GUESTS_PATH)
    return { imported, errors, error: 'Erro ao importar: parte dos convidados não foi salva.' }
  }
  logger.info(
    { event: 'admin.guests_imported', imported, errors: errors.length, adminId },
    'guests imported',
  )
  revalidatePath(GUESTS_PATH)
  return { imported, errors }
}
