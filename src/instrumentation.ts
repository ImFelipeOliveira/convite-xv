// Called once per Next.js server instance (see node_modules/next/dist/docs/01-app/02-guides/instrumentation.md).
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.NODE_ENV === 'test') return
  if (process.env.NEXT_PHASE === 'phase-production-build') return
  // e2e (Playwright) runs `next start` with DISPATCHER_ENABLED=false so tests stay deterministic
  if (process.env.DISPATCHER_ENABLED === 'false') return
  const { startDispatcher } = await import('@/features/whatsapp/dispatcher')
  startDispatcher()
}
