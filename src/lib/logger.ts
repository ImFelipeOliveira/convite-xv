import pino, { type DestinationStream, type Logger } from 'pino'

const REDACT_KEYS = ['phone', 'token', 'password', 'passwordHash', 'cookie', 'authorization', 'message']

function defaultLevel(): string {
  return process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : 'info')
}

/**
 * Error serializer that never emits messages or query data: Drizzle errors embed SQL params
 * (phones, messages, tokens) in message, stack header, `query`, `params` and `cause`.
 * Keeps type/name, code, cause code/name and stack frames only.
 */
export function sanitizeErr(err: unknown): Record<string, unknown> {
  if (!(err instanceof Error)) return { type: typeof err }
  const e = err as Error & { code?: unknown; cause?: unknown }
  const out: Record<string, unknown> = { type: e.constructor?.name ?? e.name, name: e.name }
  if (e.code !== undefined) out.code = e.code
  if (e.cause instanceof Error) {
    const c = e.cause as Error & { code?: unknown }
    out.cause = { name: c.name, ...(c.code !== undefined ? { code: c.code } : {}) }
  }
  const at = e.stack?.indexOf('\n    at ') ?? -1
  if (e.stack && at >= 0) out.stack = e.stack.slice(at + 1)
  return out
}

/** Builds a logger writing to `destination` (stdout when omitted). Exported so tests can capture output. */
export function createLogger(destination?: DestinationStream, level: string = defaultLevel()): Logger {
  return pino(
    {
      level,
      base: { service: 'convite-xv' },
      timestamp: pino.stdTimeFunctions.isoTime,
      serializers: { err: sanitizeErr, error: sanitizeErr },
      redact: {
        paths: [
          ...REDACT_KEYS,
          ...REDACT_KEYS.map((k) => `*.${k}`),
          'headers.cookie',
          'req.headers.cookie',
        ],
        censor: '[redacted]',
      },
    },
    destination,
  )
}

/** Dev only: pino-pretty as an in-process sync stream (no worker-thread transport inside Next). */
function devDestination(): DestinationStream | undefined {
  if (process.env.NODE_ENV !== 'development') return undefined
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pretty = require('pino-pretty') as typeof import('pino-pretty')
  return pretty({ colorize: true, sync: true, ignore: 'pid,hostname,service' })
}

export const logger = createLogger(devDestination())

export function childLogger(bindings: Record<string, unknown>): Logger {
  return logger.child(bindings)
}
