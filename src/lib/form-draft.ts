// In-progress form drafts kept in sessionStorage across a forced reload (version skew recovery).
// Every storage access is wrapped: private mode, blocked site data or a full quota must never break a form.

export type DraftValues = Record<string, string>
type StoredDraft = { values: DraftValues; savedAt: number }

const PREFIX = 'xv:draft:'
/** A draft older than this is ignored (the reload happens ~1.5 s after saving). */
export const DRAFT_TTL_MS = 30 * 60_000

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>

function sessionStore(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  } catch {
    return null
  }
}

export function draftStorageKey(path: string, formKey: string): string {
  return `${PREFIX}${path}#${formKey}`
}

/** Text fields of a submitted form; files and React's internal `$ACTION_*` entries are skipped. */
export function formDataToValues(formData: FormData): DraftValues {
  const values: DraftValues = {}
  formData.forEach((value, name) => {
    if (typeof value !== 'string' || name.startsWith('$')) return
    values[name] = value
  })
  return values
}

export function saveDraft(path: string, formKey: string, values: DraftValues, store = sessionStore(), now = Date.now()) {
  if (!store || Object.keys(values).length === 0) return false
  try {
    store.setItem(draftStorageKey(path, formKey), JSON.stringify({ values, savedAt: now } satisfies StoredDraft))
    return true
  } catch {
    return false
  }
}

function parse(raw: string | null, now: number): DraftValues | null {
  if (!raw) return null
  try {
    const draft = JSON.parse(raw) as Partial<StoredDraft>
    if (typeof draft.savedAt !== 'number' || now - draft.savedAt > DRAFT_TTL_MS) return null
    if (!draft.values || typeof draft.values !== 'object') return null
    const values: DraftValues = {}
    for (const [k, v] of Object.entries(draft.values)) if (typeof v === 'string') values[k] = v
    return values
  } catch {
    return null
  }
}

export function readDraft(path: string, formKey: string, store = sessionStore(), now = Date.now()): DraftValues | null {
  if (!store) return null
  try {
    return parse(store.getItem(draftStorageKey(path, formKey)), now)
  } catch {
    return null
  }
}

export function clearDraft(path: string, formKey: string, store = sessionStore()) {
  try {
    store?.removeItem(draftStorageKey(path, formKey))
  } catch {
    // storage unavailable: nothing to clear
  }
}

/** Reads and removes the draft (restored once). */
export function takeDraft(path: string, formKey: string, store = sessionStore(), now = Date.now()): DraftValues | null {
  const values = readDraft(path, formKey, store, now)
  clearDraft(path, formKey, store)
  return values
}

/** Form keys (e.g. `guest:new`, `gift:<id>`) with a live draft for this path, filtered by prefix. */
export function listDraftKeys(path: string, keyPrefix: string, store = sessionStore(), now = Date.now()): string[] {
  if (!store) return []
  const head = draftStorageKey(path, keyPrefix)
  const keys: string[] = []
  try {
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i)
      if (k?.startsWith(head) && parse(store.getItem(k), now)) keys.push(k.slice(draftStorageKey(path, '').length))
    }
  } catch {
    return []
  }
  return keys
}

/**
 * Writes the values back into the form's fields. Uses the native value setter + an `input` event,
 * so controlled React inputs pick the value up too (uncontrolled ones just keep it).
 */
export function applyDraftToForm(form: HTMLFormElement, values: DraftValues) {
  for (const [name, value] of Object.entries(values)) {
    const field = form.elements.namedItem(name)
    if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement))
      continue
    if (field instanceof HTMLInputElement && (field.type === 'hidden' || field.type === 'file')) continue
    if (field instanceof HTMLInputElement && (field.type === 'checkbox' || field.type === 'radio')) {
      field.checked = field.value === value
    } else {
      const proto = Object.getPrototypeOf(field) as object
      Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(field, value)
    }
    field.dispatchEvent(new Event('input', { bubbles: true }))
  }
}
