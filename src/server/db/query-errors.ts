import { DrizzleQueryError } from 'drizzle-orm/errors'
import { PgPreparedQuery } from 'drizzle-orm/pg-core'

// Uncaught errors (a page render with the database down, say) are printed by Next itself with
// console.error, outside our sanitizing logger. Drizzle's DrizzleQueryError message embeds every SQL
// parameter ("params: <token>,<phone>"), and the Postgres error under it can echo values too (the
// `detail` of a unique violation, "invalid input syntax …: \"<value>\""). So every query error is
// scrubbed where it is thrown: what is left is the SQL text (placeholders only) and the error codes.

/** Postgres error fields that never carry values (codes and identifiers); kept on the scrubbed cause. */
const SAFE_FIELDS = [
  'code',
  'errno',
  'syscall',
  'severity',
  'routine',
  'schema_name',
  'table_name',
  'column_name',
  'constraint_name',
] as const

/** Stack frames only (the header repeats the message; skipped by its line count, so fake frames in it go too). */
function framesOf(err: Error): string {
  if (!err.stack) return ''
  const headerLines = String(err.message).split('\n').length
  return err.stack
    .split('\n')
    .slice(headerLines)
    .filter((line) => /^\s+at\s/.test(line))
    .join('\n')
}

function withFrames(header: string, frames: string): string {
  return frames ? `${header}\n${frames}` : header
}

/**
 * A fresh error standing in for the driver's: its name and value-free fields, no message text. A fresh
 * object because postgres.js pins `query`/`parameters`/`args` on the original as non-configurable props.
 */
function scrubCause(cause: unknown): Error | undefined {
  if (!(cause instanceof Error)) return undefined
  const src = cause as Error & Record<string, unknown>
  const code = typeof src.code === 'string' || typeof src.code === 'number' ? String(src.code) : ''
  const safe = new Error(code ? `${src.name} ${code}` : src.name) as Error & Record<string, unknown>
  safe.name = src.name
  for (const field of SAFE_FIELDS) {
    if (src[field] !== undefined) safe[field] = src[field]
  }
  safe.stack = withFrames(`${safe.name}: ${safe.message}`, framesOf(src))
  return safe
}

/** Strips parameter values (and value-echoing driver messages) from a query error, in place. */
export function scrubQueryError(err: unknown): unknown {
  if (!(err instanceof DrizzleQueryError)) return err
  const frames = framesOf(err)
  const message = `Failed query: ${err.query}`
  err.message = message
  err.stack = withFrames(`${err.name}: ${message}`, frames)
  delete (err as { params?: unknown }).params
  err.cause = scrubCause(err.cause)
  return err
}

type QueryWithCache = (this: unknown, ...args: unknown[]) => Promise<unknown>
const PATCHED = Symbol.for('convite-xv.scrubbedQueryErrors')

/**
 * Patches Drizzle's single query funnel (every select/insert/update/delete/execute, in or out of a
 * transaction, goes through PgPreparedQuery#queryWithCache, which builds the DrizzleQueryError) so the
 * error leaves already scrubbed. Idempotent. Guarded by src/server/db/__tests__/query-errors.test.ts:
 * a Drizzle upgrade that renames the funnel fails the test instead of silently leaking params.
 */
export function installQueryErrorScrubbing(): void {
  const proto = PgPreparedQuery.prototype as unknown as Record<PropertyKey, unknown>
  if (proto[PATCHED]) return
  const original = proto.queryWithCache as QueryWithCache | undefined
  if (typeof original !== 'function') throw new Error('drizzle: PgPreparedQuery#queryWithCache not found')
  proto.queryWithCache = async function (this: unknown, ...args: unknown[]) {
    try {
      return await original.apply(this, args)
    } catch (err) {
      throw scrubQueryError(err)
    }
  }
  proto[PATCHED] = true
}
