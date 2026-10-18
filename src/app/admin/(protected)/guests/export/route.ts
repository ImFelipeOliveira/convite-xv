import { requireAdmin } from '@/features/admin-auth/guard'
import { buildGuestsCsv } from '@/features/guests/csv'
import { listGuests } from '@/features/guests/repo'
import { logger } from '@/lib/logger'

export async function GET(): Promise<Response> {
  const { adminId } = await requireAdmin()
  const list = await listGuests()
  logger.info({ event: 'admin.guests_exported', count: list.length, adminId }, 'guests exported')
  return new Response(buildGuestsCsv(list), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="guests.csv"',
      'Cache-Control': 'private, no-store',
    },
  })
}
