import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { installQueryErrorScrubbing } from './query-errors'
import * as schema from './schema'

// query errors never carry SQL parameter values (tokens, phones) into logs, not even Next's own
installQueryErrorScrubbing()

const url =
  process.env.NODE_ENV === 'test' ? process.env.DATABASE_URL_TEST : process.env.DATABASE_URL

if (!url) {
  throw new Error(
    process.env.NODE_ENV === 'test' ? 'DATABASE_URL_TEST is not set' : 'DATABASE_URL is not set',
  )
}

const globalForDb = globalThis as unknown as { pgClient?: ReturnType<typeof postgres> }
const client = globalForDb.pgClient ?? postgres(url)
if (process.env.NODE_ENV !== 'production') globalForDb.pgClient = client

export const db = drizzle(client, { schema })
