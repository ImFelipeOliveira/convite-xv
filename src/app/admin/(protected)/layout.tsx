import { Suspense } from 'react'
import { AdminShell } from '@/components/admin/AdminShell'
import { PageSkeleton } from '@/components/admin/ui/Skeleton'
import { requireAdmin } from '@/features/admin-auth/guard'

// The session read happens inside Suspense (cookies() is request-time with Cache Components),
// and gates the children: nothing of the panel renders without a valid session.
async function Guard({ children }: { children: React.ReactNode }) {
  await requireAdmin()
  return <>{children}</>
}

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminShell>
      <Suspense fallback={<PageSkeleton />}>
        <Guard>{children}</Guard>
      </Suspense>
    </AdminShell>
  )
}
