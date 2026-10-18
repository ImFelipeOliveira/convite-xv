'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/admin/ui/Button'
import { claimSkewReload, SKEW_RELOAD_BLOCKED_MESSAGE } from '@/lib/skew-reload'
import { isVersionSkewError, SKEW_RELOAD_DELAY_MS, SKEW_RELOAD_MESSAGE } from '@/lib/version-skew'

// Safety net for admin errors no call site handled, e.g. the "Sair" form or the login form hitting a
// Server Action from an older deployment: reload into the new build instead of a dead page
// (same reload cap as the panel's own recovery).
export default function AdminError({ error, retry }: { error: unknown; retry: () => void }) {
  const skew = isVersionSkewError(error)
  const [blocked, setBlocked] = useState(false)
  useEffect(() => {
    if (!skew) {
      console.error(error)
      return
    }
    if (!claimSkewReload()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reads sessionStorage, client only
      setBlocked(true)
      return
    }
    const t = setTimeout(() => window.location.reload(), SKEW_RELOAD_DELAY_MS)
    return () => clearTimeout(t)
  }, [error, skew])

  const message = !skew ? 'Algo deu errado ao carregar o painel.' : blocked ? SKEW_RELOAD_BLOCKED_MESSAGE : SKEW_RELOAD_MESSAGE
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-paper px-6 text-center text-wine">
      <p role="status" className="max-w-[40ch] text-lg">
        {message}
      </p>
      {(!skew || blocked) && (
        <div className="flex gap-2">
          {!skew && (
            <Button variant="secondary" onClick={() => retry()}>
              Tentar de novo
            </Button>
          )}
          <Button onClick={() => window.location.reload()}>Recarregar</Button>
        </div>
      )}
    </main>
  )
}
