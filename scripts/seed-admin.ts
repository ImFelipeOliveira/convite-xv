// Usage: pnpm seed:admin <email> <password>  (creates the admin or updates its password)
try {
  process.loadEnvFile('.env.local')
} catch {
  // no .env.local: fall back to the process environment
}

async function main() {
  const [emailArg, password] = process.argv.slice(2)
  if (!emailArg || !password) {
    console.error('Usage: pnpm seed:admin <email> <password>')
    process.exit(1)
  }
  const email = emailArg.trim().toLowerCase()
  // imported after loadEnvFile: the db client reads DATABASE_URL at import time
  const { hashPassword } = await import('../src/features/admin-auth/password')
  const { db } = await import('../src/server/db/client')
  const { admins } = await import('../src/server/db/schema')
  const passwordHash = await hashPassword(password)
  await db
    .insert(admins)
    .values({ email, passwordHash })
    .onConflictDoUpdate({ target: admins.email, set: { passwordHash } })
  console.log(`Admin ${email} saved.`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
