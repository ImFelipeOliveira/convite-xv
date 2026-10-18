// HTTP Range support for /media (RFC 9110 §14). iOS Safari won't play an <audio> whose server ignores
// Range, so the music needs real 206 answers; gift photos get them for free.

/** A single byte range as asked: `start-[end]` or the last `suffix` bytes. */
export type ByteRange = { start: number; end?: number } | { suffix: number }

/** Inclusive byte positions actually served. */
export type ResolvedRange = { start: number; end: number }

const SINGLE_RANGE = /^bytes=(\d*)-(\d*)$/i

/**
 * The single range of a Range header, or null to ignore it and answer 200 with the whole object: no
 * header, a malformed one, another unit, or several ranges (a server may always ignore Range).
 */
export function parseRangeHeader(header: string | null): ByteRange | null {
  if (!header) return null
  const match = SINGLE_RANGE.exec(header.trim())
  if (!match) return null
  const [, first, last] = match
  if (first === '' && last === '') return null
  const start = first === '' ? null : Number(first)
  const end = last === '' ? null : Number(last)
  // absurd positions (past 2^53) are as good as malformed
  if ((start !== null && !Number.isSafeInteger(start)) || (end !== null && !Number.isSafeInteger(end))) return null
  if (start === null) return { suffix: end! }
  if (end === null) return { start }
  return end < start ? null : { start, end }
}

/** The positions to serve for `range` on an object of `size` bytes, or null when it can't be satisfied (416). */
export function resolveRange(range: ByteRange, size: number): ResolvedRange | null {
  if (size <= 0) return null
  if ('suffix' in range) {
    if (range.suffix <= 0) return null
    return { start: Math.max(0, size - range.suffix), end: size - 1 }
  }
  if (range.start >= size) return null
  return { start: range.start, end: Math.min(range.end ?? size - 1, size - 1) }
}

/** The Range header value that asks a storage backend (S3 GetObject) for `range`. */
export function rangeHeaderValue(range: ByteRange): string {
  return 'suffix' in range ? `bytes=-${range.suffix}` : `bytes=${range.start}-${range.end ?? ''}`
}

/** Parses a Content-Range response header (`bytes 0-99/1234`). */
export function parseContentRange(header: string | undefined): (ResolvedRange & { size: number }) | null {
  const match = header ? /^bytes (\d+)-(\d+)\/(\d+)$/.exec(header.trim()) : null
  if (!match) return null
  return { start: Number(match[1]), end: Number(match[2]), size: Number(match[3]) }
}

/** Thrown by a storage adapter when the asked range starts past the end of the object. */
export class RangeNotSatisfiableError extends Error {
  constructor(readonly size: number | undefined) {
    super('range not satisfiable')
    this.name = 'RangeNotSatisfiableError'
  }
}
