// Applies pending Drizzle migrations. Bundled to scripts/migrate.js in the Docker image and
// run before the server starts: node scripts/migrate.js && node server.js
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  // dedicated single connection: the migrator must not share the app pool
  const client = postgres(url, { max: 1 })
  try {
    await migrate(drizzle(client), { migrationsFolder: 'drizzle' })
    console.log('Migrations applied.')
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
