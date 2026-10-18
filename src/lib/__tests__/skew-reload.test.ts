import { describe, expect, it } from 'vitest'
import {
  claimSkewReload,
  decideSkewReload,
  resetSkewReloads,
  SKEW_RELOAD_WINDOW_MS,
  SKEW_RELOADS_KEY,
} from '../skew-reload'

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

describe('decideSkewReload', () => {
  it('allows two reloads within a minute and blocks the third', () => {
    const first = decideSkewReload(null, 1000)
    expect(first).toEqual({ allow: true, log: { count: 1, firstAt: 1000 } })
    const second = decideSkewReload(first.log, 5000)
    expect(second).toEqual({ allow: true, log: { count: 2, firstAt: 1000 } })
    expect(decideSkewReload(second.log, 9000).allow).toBe(false)
  })

  it('starts a new window after 60 s (or a clock going backwards)', () => {
    expect(decideSkewReload({ count: 2, firstAt: 0 }, SKEW_RELOAD_WINDOW_MS)).toEqual({
      allow: true,
      log: { count: 1, firstAt: SKEW_RELOAD_WINDOW_MS },
    })
    expect(decideSkewReload({ count: 2, firstAt: 10_000 }, 5000).allow).toBe(true)
  })
})

describe('claimSkewReload', () => {
  it('counts across page loads in storage and resets after a successful action', () => {
    const store = memoryStorage()
    expect(claimSkewReload(store, 1000)).toBe(true)
    expect(claimSkewReload(store, 2000)).toBe(true)
    expect(claimSkewReload(store, 3000)).toBe(false)
    resetSkewReloads(store)
    expect(store.map.has(SKEW_RELOADS_KEY)).toBe(false)
    expect(claimSkewReload(store, 4000)).toBe(true)
  })

  it('tolerates garbage and unavailable storage', () => {
    const store = memoryStorage()
    store.setItem(SKEW_RELOADS_KEY, '{oops')
    expect(claimSkewReload(store, 0)).toBe(true)
    const broken = {
      length: 0,
      key: () => null,
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
    expect(claimSkewReload(broken, 0)).toBe(true)
    expect(() => resetSkewReloads(broken)).not.toThrow()
    expect(claimSkewReload(null)).toBe(true)
  })
})
