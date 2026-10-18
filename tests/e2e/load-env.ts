// Imported first so E2E_PORT / FAKE_EVOLUTION_PORT from .env.local apply before the fixtures read them.
try {
  process.loadEnvFile('.env.local')
} catch {
  // no .env.local: fall back to the process environment
}
