'use client'

import { useEffect } from 'react'
import { Button } from '@/components/admin/ui/Button'
import { isVersionSkewError, SKEW_RELOAD_DELAY_MS, SKEW_RELOAD_MESSAGE } from '@/lib/version-skew'

// Safety net for admin errors no call site handled, e.g. the "Sair" form or the login form hitting a
// Server Action from an older deployment: reload into the new build instead of a dead page.
export default function AdminError({ error, retry }: { error: unknown; retry: () => void }) {
  const skew = isVersionSkewError(error)
  useEffect(() => {
    if (!skew) {
      console.error(error)
      return
    }
    const t = setTimeout(() => window.location.reload(), SKEW_RELOAD_DELAY_MS)
    return () => clearTimeout(t)
  }, [error, skew])

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-paper px-6 text-center text-wine">
      <p role="status" className="max-w-[40ch] text-lg">
        {skew ? SKEW_RELOAD_MESSAGE : 'Algo deu errado ao carregar o painel.'}
      </p>
      {!skew && (
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => retry()}>
            Tentar de novo
          </Button>
          <Button onClick={() => window.location.reload()}>Recarregar</Button>
        </div>
      )}
    </main>
  )
}
