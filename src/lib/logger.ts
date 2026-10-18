import pino, { type DestinationStream, type Logger } from 'pino'

const REDACT_KEYS = ['phone', 'token', 'password', 'passwordHash', 'cookie', 'authorization', 'message']

function defaultLevel(): string {
  return process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : 'info')
}

/** Builds a logger writing to `destination` (stdout when omitted). Exported so tests can capture output. */
export function createLogger(destination?: DestinationStream, level: string = defaultLevel()): Logger {
  return pino(
    {
      level,
      base: { service: 'convite-xv' },
      timestamp: pino.stdTimeFunctions.isoTime,
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
