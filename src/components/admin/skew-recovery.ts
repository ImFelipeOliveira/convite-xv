'use client'

import { useCallback, useEffect, useRef, type RefObject } from 'react'
import {
  applyDraftToForm,
  clearDraft,
  formDataToValues,
  listDraftKeys,
  readDraft,
  saveDraft,
  takeDraft,
  type DraftValues,
} from '@/lib/form-draft'
import { claimSkewReload, resetSkewReloads, SKEW_RELOAD_BLOCKED_MESSAGE } from '@/lib/skew-reload'
import { isVersionSkewError, SKEW_RELOAD_DELAY_MS, SKEW_RELOAD_MESSAGE } from '@/lib/version-skew'
import { useToast } from './ui/Toast'

type Toast = ReturnType<typeof useToast>
export type SkewDraft = { key: string; values: DraftValues }
type GuardOptions = { draft?: SkewDraft; onBlocked?: () => void }

// one reload per page, however many actions fail at once (polling + a click)
let reloading = false

/** Saves the draft and reloads into the new deployment, unless the reload cap was hit. */
function reloadIntoNewDeployment(toast: Toast, { draft, onBlocked }: GuardOptions) {
  if (draft) saveDraft(window.location.pathname, draft.key, draft.values)
  if (reloading) return
  if (!claimSkewReload()) {
    // reloaded twice in a minute and still stale: stop looping; the draft stays saved for a manual reload
    toast.error(SKEW_RELOAD_BLOCKED_MESSAGE)
    onBlocked?.()
    return
  }
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
    async function guard<T>(run: () => Promise<T>, options: GuardOptions = {}): Promise<T | undefined> {
      try {
        const result = await run()
        resetSkewReloads()
        return result
      } catch (error) {
        if (!isVersionSkewError(error)) throw error
        reloadIntoNewDeployment(toast, options)
        return undefined
      }
    },
    [toast],
  )
}

/**
 * Skew-safe useActionState action for a form (spread `formRef` on the <form>):
 * - on version skew it keeps the previous state, saves the submitted values as a draft and reloads;
 * - after the reload it restores the draft into the form (once);
 * - if the reload was blocked by the cap, it puts the values back after React's automatic form reset.
 * Without `draftKey` (file upload) it only reloads.
 */
export function useSkewSafeForm<S>(action: (prev: S, formData: FormData) => Promise<S>, draftKey?: string) {
  const guard = useSkewGuard()
  const toast = useToast()
  const formRef = useRef<HTMLFormElement>(null)

  // reload blocked: refill what the admin typed (the draft stays stored for a manual reload). React resets
  // the form natively (form.reset()) when the action transition commits, after this call: refill now and
  // again right after that reset event.
  const refillAfterBlock = useCallback(() => {
    const form = formRef.current
    if (!form || !draftKey) return
    const refill = () => {
      const values = readDraft(window.location.pathname, draftKey)
      if (values) applyDraftToForm(form, values)
    }
    refill()
    const onReset = () => setTimeout(refill, 0) // the reset event fires before the values are reset
    form.addEventListener('reset', onReset, { once: true })
    setTimeout(() => form.removeEventListener('reset', onReset), 5000)
  }, [draftKey])

  const safeAction = useCallback(
    async (prev: S, formData: FormData): Promise<S> => {
      const draft = draftKey ? { key: draftKey, values: formDataToValues(formData) } : undefined
      const result = await guard(() => action(prev, formData), { draft, onBlocked: refillAfterBlock })
      return result === undefined ? prev : result
    },
    [guard, action, draftKey, refillAfterBlock],
  )

  // after the reload: restore a saved draft once
  useEffect(() => {
    const form = formRef.current
    if (!form || !draftKey) return
    const values = takeDraft(window.location.pathname, draftKey)
    if (!values) return
    applyDraftToForm(form, values)
    toast.info('Rascunho recuperado. Revise e salve de novo.')
    // restore on mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey])

  return { action: safeAction, formRef: formRef as RefObject<HTMLFormElement | null> }
}

/**
 * After the reload: if this page has a pending draft whose key starts with `keyPrefix` (e.g. `guest:`),
 * calls `reopen` with the rest of the key (`new` or the record id) so the sheet opens again and its
 * form restores the draft. `reopen` returns false when the record no longer exists: the draft is dropped.
 */
export function useReopenDraftSheet(keyPrefix: string, reopen: (rest: string) => boolean) {
  useEffect(() => {
    const path = window.location.pathname
    const key = listDraftKeys(path, keyPrefix)[0]
    if (key && !reopen(key.slice(keyPrefix.length))) clearDraft(path, key)
    // mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
