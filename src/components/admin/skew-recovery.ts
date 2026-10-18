'use client'

import { useCallback, useEffect, type RefObject } from 'react'
import { applyDraftToForm, formDataToValues, listDraftKeys, saveDraft, takeDraft, type DraftValues } from '@/lib/form-draft'
import { isVersionSkewError, SKEW_RELOAD_DELAY_MS, SKEW_RELOAD_MESSAGE } from '@/lib/version-skew'
import { useToast } from './ui/Toast'

type Toast = ReturnType<typeof useToast>
export type SkewDraft = { key: string; values: DraftValues }

// one reload per page, however many actions fail at once (polling + a click)
let reloading = false

function reloadIntoNewDeployment(toast: Toast, draft?: SkewDraft) {
  if (draft) saveDraft(window.location.pathname, draft.key, draft.values)
  if (reloading) return
  reloading = true
  toast.info(SKEW_RELOAD_MESSAGE)
  setTimeout(() => window.location.reload(), SKEW_RELOAD_DELAY_MS)
}

/**
 * Runs a Server Action call; when it failed because the panel is from an older deployment, saves the
 * draft (if any), tells the admin and reloads. Resolves to `undefined` in that case; other errors rethrow.
 */
export function useSkewGuard() {
  const toast = useToast()
  return useCallback(
    async function guard<T>(run: () => Promise<T>, draft?: SkewDraft): Promise<T | undefined> {
      try {
        return await run()
      } catch (error) {
        if (!isVersionSkewError(error)) throw error
        reloadIntoNewDeployment(toast, draft)
        return undefined
      }
    },
    [toast],
  )
}

/** Wraps a useActionState action: on version skew it keeps the previous state and saves the form draft. */
export function useSkewSafeFormAction<S>(action: (prev: S, formData: FormData) => Promise<S>, draftKey?: string) {
  const guard = useSkewGuard()
  return useCallback(
    async (prev: S, formData: FormData): Promise<S> => {
      const draft = draftKey ? { key: draftKey, values: formDataToValues(formData) } : undefined
      const result = await guard(() => action(prev, formData), draft)
      return result === undefined ? prev : result
    },
    [guard, action, draftKey],
  )
}

/** After the reload: puts a saved draft back into the form (once). */
export function useDraftRestore(formRef: RefObject<HTMLFormElement | null>, draftKey: string) {
  const toast = useToast()
  useEffect(() => {
    const form = formRef.current
    if (!form) return
    const values = takeDraft(window.location.pathname, draftKey)
    if (!values) return
    applyDraftToForm(form, values)
    toast.info('Rascunho recuperado. Revise e salve de novo.')
    // restore on mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey])
}

/**
 * After the reload: if this page has a pending draft whose key starts with `keyPrefix` (e.g. `guest:`),
 * calls `reopen` with the rest of the key (`new` or the record id) so the sheet opens again and its
 * form restores the draft.
 */
export function useReopenDraftSheet(keyPrefix: string, reopen: (rest: string) => void) {
  useEffect(() => {
    const key = listDraftKeys(window.location.pathname, keyPrefix)[0]
    if (key) reopen(key.slice(keyPrefix.length))
    // mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
