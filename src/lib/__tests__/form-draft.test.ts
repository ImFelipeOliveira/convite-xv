import { describe, expect, it } from 'vitest'
import {
  clearDraft,
  draftStorageKey,
  DRAFT_TTL_MS,
  formDataToValues,
  listDraftKeys,
  readDraft,
  saveDraft,
  takeDraft,
} from '../form-draft'

function memoryStorage() {
  const map = new Map<string, string>()
  return {
    map,
    get length() {
      return map.size
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  }
}

const throwing = {
  length: 1,
  key: () => {
    throw new Error('SecurityError')
  },
  getItem: () => {
    throw new Error('SecurityError')
  },
  setItem: () => {
    throw new Error('QuotaExceededError')
  },
  removeItem: () => {
    throw new Error('SecurityError')
  },
}

describe('form drafts', () => {
  it('keeps text fields and drops files and React internals', () => {
    const fd = new FormData()
    fd.set('name', 'Ana')
    fd.set('plusOnesLimit', '2')
    fd.set('$ACTION_ID_abc', '')
    fd.set('file', new File(['x'], 'a.csv'))
    expect(formDataToValues(fd)).toEqual({ name: 'Ana', plusOnesLimit: '2' })
  })

  it('keeps the uploaded photo key of the gift form, never the picked file', () => {
    const fd = new FormData()
    fd.set('name', 'Luminária')
    fd.set('imageKey', 'gifts/0b7c5a52-3f0e-4a8e-9a43-2f7d1c9e6b11.webp')
    fd.set('photo', new File([new Uint8Array([137, 80, 78, 71])], 'foto.png', { type: 'image/png' }))
    expect(formDataToValues(fd)).toEqual({
      name: 'Luminária',
      imageKey: 'gifts/0b7c5a52-3f0e-4a8e-9a43-2f7d1c9e6b11.webp',
    })
  })

  it('never keeps the one-off duplicate phone confirmation', () => {
    const fd = new FormData()
    fd.set('name', 'Ana')
    fd.set('phone', '95991234567')
    fd.set('confirmDuplicatePhone', '1')
    expect(formDataToValues(fd)).toEqual({ name: 'Ana', phone: '95991234567' })
    const store = memoryStorage()
    saveDraft('/admin/guests', 'guest:new', { name: 'Ana', confirmDuplicatePhone: '1' }, store, 1000)
    expect(readDraft('/admin/guests', 'guest:new', store, 2000)).toEqual({ name: 'Ana' })
    expect(saveDraft('/admin/guests', 'guest:new', { confirmDuplicatePhone: '1' }, store, 1000)).toBe(false)
  })

  it('saves, reads once with take, and clears', () => {
    const store = memoryStorage()
    expect(saveDraft('/admin/guests', 'guest:new', { name: 'Ana' }, store, 1000)).toBe(true)
    expect(store.map.has(draftStorageKey('/admin/guests', 'guest:new'))).toBe(true)
    expect(readDraft('/admin/guests', 'guest:new', store, 2000)).toEqual({ name: 'Ana' })
    // other path or form: nothing
    expect(readDraft('/admin/gifts', 'guest:new', store, 2000)).toBeNull()
    expect(takeDraft('/admin/guests', 'guest:new', store, 2000)).toEqual({ name: 'Ana' })
    expect(takeDraft('/admin/guests', 'guest:new', store, 2000)).toBeNull()
    saveDraft('/admin/settings', 'settings', { a: 'b' }, store, 1000)
    clearDraft('/admin/settings', 'settings', store)
    expect(store.map.size).toBe(0)
  })

  it('ignores expired, malformed and empty drafts', () => {
    const store = memoryStorage()
    saveDraft('/p', 'f', { name: 'Ana' }, store, 0)
    expect(readDraft('/p', 'f', store, DRAFT_TTL_MS + 1)).toBeNull()
    store.setItem(draftStorageKey('/p', 'g'), '{not json')
    expect(readDraft('/p', 'g', store, 0)).toBeNull()
    // both were deleted when encountered
    expect(store.map.has(draftStorageKey('/p', 'f'))).toBe(false)
    expect(store.map.has(draftStorageKey('/p', 'g'))).toBe(false)
    store.setItem(draftStorageKey('/p', 'h'), JSON.stringify({ values: { a: 1, b: 'ok' }, savedAt: 0 }))
    expect(readDraft('/p', 'h', store, 0)).toEqual({ b: 'ok' })
    expect(saveDraft('/p', 'empty', {}, store)).toBe(false)
  })

  it('lists live draft keys by prefix for the current path', () => {
    const store = memoryStorage()
    saveDraft('/admin/guests', 'guest:abc', { name: 'Ana' }, store, 1000)
    saveDraft('/admin/guests', 'other:new', { name: 'X' }, store, 1000)
    saveDraft('/admin/gifts', 'guest:zzz', { name: 'Y' }, store, 1000)
    expect(listDraftKeys('/admin/guests', 'guest:', store, 2000)).toEqual(['guest:abc'])
    expect(listDraftKeys('/admin/guests', 'guest:', store, 1000 + DRAFT_TTL_MS + 1)).toEqual([])
    // the expired guest draft was removed; unrelated keys stay
    expect(store.map.has(draftStorageKey('/admin/guests', 'guest:abc'))).toBe(false)
    expect(store.map.has(draftStorageKey('/admin/guests', 'other:new'))).toBe(true)
  })

  it('never throws when storage is unavailable', () => {
    expect(saveDraft('/p', 'f', { a: 'b' }, throwing)).toBe(false)
    expect(readDraft('/p', 'f', throwing)).toBeNull()
    expect(takeDraft('/p', 'f', throwing)).toBeNull()
    expect(listDraftKeys('/p', 'f', throwing)).toEqual([])
    expect(() => clearDraft('/p', 'f', throwing)).not.toThrow()
    // no window in node: the default store is null
    expect(saveDraft('/p', 'f', { a: 'b' })).toBe(false)
    expect(readDraft('/p', 'f')).toBeNull()
  })
})
