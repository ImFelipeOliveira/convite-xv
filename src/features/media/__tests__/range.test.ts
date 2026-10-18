import { describe, expect, it } from 'vitest'
import { parseContentRange, parseRangeHeader, rangeHeaderValue, resolveRange } from '../range'

describe('parseRangeHeader', () => {
  it('parses closed, open-ended and suffix ranges', () => {
    expect(parseRangeHeader('bytes=0-1')).toEqual({ start: 0, end: 1 })
    expect(parseRangeHeader('bytes=100-')).toEqual({ start: 100 })
    expect(parseRangeHeader('bytes=-500')).toEqual({ suffix: 500 })
    expect(parseRangeHeader(' BYTES=5-9 ')).toEqual({ start: 5, end: 9 })
  })

  it('ignores what it should not honor (the whole object is served instead)', () => {
    expect(parseRangeHeader(null)).toBeNull()
    expect(parseRangeHeader('')).toBeNull()
    expect(parseRangeHeader('bytes=-')).toBeNull()
    expect(parseRangeHeader('bytes=9-5')).toBeNull()
    expect(parseRangeHeader('bytes=0-1,5-9')).toBeNull()
    expect(parseRangeHeader('items=0-1')).toBeNull()
    expect(parseRangeHeader('bytes=a-b')).toBeNull()
    expect(parseRangeHeader('bytes=99999999999999999999-')).toBeNull()
  })
})

describe('resolveRange', () => {
  it('clamps to the object size', () => {
    expect(resolveRange({ start: 0, end: 1 }, 10)).toEqual({ start: 0, end: 1 })
    expect(resolveRange({ start: 4 }, 10)).toEqual({ start: 4, end: 9 })
    expect(resolveRange({ start: 4, end: 999 }, 10)).toEqual({ start: 4, end: 9 })
    expect(resolveRange({ suffix: 3 }, 10)).toEqual({ start: 7, end: 9 })
    expect(resolveRange({ suffix: 50 }, 10)).toEqual({ start: 0, end: 9 })
  })

  it('is unsatisfiable past the end, for an empty suffix or an empty object', () => {
    expect(resolveRange({ start: 10 }, 10)).toBeNull()
    expect(resolveRange({ suffix: 0 }, 10)).toBeNull()
    expect(resolveRange({ start: 0 }, 0)).toBeNull()
  })
})

describe('S3 helpers', () => {
  it('builds the Range header for the bucket and reads its Content-Range', () => {
    expect(rangeHeaderValue({ start: 0, end: 1 })).toBe('bytes=0-1')
    expect(rangeHeaderValue({ start: 7 })).toBe('bytes=7-')
    expect(rangeHeaderValue({ suffix: 4 })).toBe('bytes=-4')
    expect(parseContentRange('bytes 0-1/1234')).toEqual({ start: 0, end: 1, size: 1234 })
    expect(parseContentRange(undefined)).toBeNull()
    expect(parseContentRange('bytes */1234')).toBeNull()
  })
})
