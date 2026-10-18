import './load-env'
import type { Route } from '@playwright/test'

export const E2E_GUEST_TOKEN = 'TesteE2E00000000000001'
export const E2E_GUEST_NAME = 'Convidado Teste'
export const E2E_ADMIN_EMAIL = 'admin@teste.local'
export const E2E_ADMIN_PASSWORD = 'senha-teste'
export const E2E_PORT = Number(process.env.E2E_PORT || 3000)

/** Saved admin session (written by auth.setup.ts, gitignored). */
export const ADMIN_STORAGE_STATE = 'tests/e2e/.auth/admin.json'

/** What Next answers for a Server Action id this deployment doesn't know (action-handler.js). */
export async function answerAsUnknownAction(route: Route) {
  const req = route.request()
  if (req.method() !== 'POST' || !req.headers()['next-action']) return route.fallback()
  return route.fulfill({
    status: 409,
    headers: { 'x-nextjs-action-not-found': '1', 'content-type': 'text/plain' },
    body: 'Server Action unavailable.',
  })
}
