'use client'

import { useCallback, useState } from 'react'

/**
 * Tracks whether an <img> failed to load. A server-rendered image can fail before hydration, when
 * React's onError isn't attached yet: the callback ref checks the finished-but-empty state on mount.
 */
export function useImageFailed(url: string | null): {
  failed: boolean
  imgRef: (img: HTMLImageElement | null) => void
  onError: () => void
} {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const imgRef = useCallback(
    (img: HTMLImageElement | null) => {
      if (img && url && img.complete && img.naturalWidth === 0) setFailedUrl(url)
    },
    [url],
  )
  const onError = useCallback(() => setFailedUrl(url), [url])
  return { failed: !!url && failedUrl === url, imgRef, onError }
}
