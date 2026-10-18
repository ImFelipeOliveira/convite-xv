import { redirect } from 'next/navigation'
import { getSession } from './session'

/** Call at the top of the protected layout and of every admin Server Action / route handler. */
export async function requireAdmin(): Promise<{ adminId: string }> {
  const session = await getSession()
  if (!session) redirect('/admin/login')
  return session
}
