'use client'

import { useEffect, useRef } from 'react'
import { markInviteOpenedAction } from '@/features/guests/opened-action'

/** Records the open once the page has hydrated in a real browser (preview fetchers never run JS). */
export function MarkOpened({ token }: { token: string }) {
  const sent = useRef(false)
  useEffect(() => {
    if (sent.current) return
    sent.current = true
    void markInviteOpenedAction(token).catch(() => {})
  }, [token])
  return null
}
