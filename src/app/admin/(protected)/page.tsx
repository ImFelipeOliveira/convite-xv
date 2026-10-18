import { requireAdmin } from '@/features/admin-auth/guard'

export default async function AdminHomePage() {
  await requireAdmin()
  return <h1 className="text-2xl font-medium">Painel</h1>
}
